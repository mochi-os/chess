# Copyright © 2026 Mochisoft OÜ
# SPDX-License-Identifier: AGPL-3.0-only
# This file is part of Mochi, licensed under the GNU AGPL v3 with the
# Mochi Application Interface Exception - see license.txt and license-exception.md.

# Mochi Chess app

# Trust model: chess.js in the client is the rules engine; the server validates
# shape (fields, status set, winner is a player), never legality. A participant
# with a modified client can submit an illegal state - accepted by design, not a
# defect. What the server does enforce: participation (only listed players reach
# a game; event_new requires sender and recipient both be players), provenance
# (inbound state is bound to a player), convergence and shape. The protocol
# itself - ordering, snapshots, reconciliation - is shared with go and words in
# lib/games.star.

# Live-update websocket for messages.insert of type 'message' or 'move'; move
# payloads carry the games row state the move action just wrote. 'system'
# messages (resign, draw offer/accept/decline) stay on direct
# mochi.websocket.write: the hook cannot tell the four apart from the row state.
# Every frame that adds a chat row carries the row's id, so a client tells two
# rows apart however alike they are.
def chess_commit_hook(table, kind, row_uid):
	if table != "messages" or kind != "insert" or not row_uid:
		return
	message = mochi.db.row("select * from messages where id=?", row_uid)
	if not message:
		return
	if message["type"] == "system":
		return
	game = mochi.db.row("select key, fen, pgn, status, winner, draw_offer from games where id=?", message["game"])
	if not game:
		return
	payload = {
		"type": message["type"],
		"id": message["id"],
		"created": message["created"],
		"member": message["member"],
		"name": message["name"],
		"body": message["body"],
	}
	if message["type"] == "move":
		payload["fen"] = game["fen"]
		payload["pgn"] = game["pgn"] or ""
		payload["status"] = game["status"]
		payload["winner"] = game["winner"] or ""
		payload["draw_offer"] = game["draw_offer"] or ""
	mochi.websocket.write(game["key"], payload)

# Lazy hook registration; the call to mochi.db.commit.hook needs a
# user/app context that's only present during a real request, not at
# module load. Re-registering on every call is a plain assignment on
# the AppVersion struct - cheap and idempotent at the framework level.
def chess_ensure_commit_hook():
	mochi.db.commit.hook("chess_commit_hook")

def database_upgrade(version):
	if version == 4:
		# Version tuple columns (writer, event) - see lib/games.star.
		columns = []
		for column in mochi.db.table("games"):
			columns.append(column["name"])
		if "writer" not in columns:
			mochi.db.execute("alter table games add column writer text not null default ''")
		if "event" not in columns:
			mochi.db.execute("alter table games add column event text not null default ''")
	if version == 3:
		# Monotonic revision, bumped by every state change and carried on
		# every outbound event. Local writes compare-and-swap on the value
		# they read; inbound writes apply only when they carry a higher one.
		# Existing rows start at 0 on both peers, so they stay in step.
		found = False
		for column in mochi.db.table("games"):
			if column["name"] == "revision":
				found = True
		if not found:
			mochi.db.execute("alter table games add column revision integer not null default 0")
	if version == 2:
		# Drop the broadcast tables left in the app data DB when broadcast state moved
		# to the per-app system DB - stale copies mislead diagnosis.
		for table in ["sequence", "log", "acknowledged", "received"]:
			mochi.db.execute("drop table if exists " + table)

# Create database
def database_create():
	mochi.db.execute("""create table if not exists games (
		id text not null primary key,
		identity text not null,
		identity_name text not null,
		opponent text not null,
		opponent_name text not null,
		white text not null,
		status text not null default 'active',
		winner text,
		fen text not null default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
		pgn text not null default '',
		draw_offer text,
		key text not null,
		revision integer not null default 0,
		writer text not null default '',
		event text not null default '',
		updated integer not null,
		created integer not null
	)""")
	mochi.db.execute("create index if not exists games_updated on games( updated )")
	mochi.db.execute("create index if not exists games_identity on games( identity )")
	mochi.db.execute("create index if not exists games_opponent on games( opponent )")

	mochi.db.execute("""create table if not exists messages (
		id text not null primary key,
		game references games( id ),
		member text not null,
		name text not null,
		body text not null,
		type text not null default 'message',
		event text not null default '',
		created integer not null
	)""")
	mochi.db.execute("create index if not exists messages_game_created on messages( game, created )")

def action_user_asset(a):
	return game_asset(GAME, a)

def get_opponent(game, user_id):
	if game["identity"] == user_id:
		return game["opponent"]
	return game["identity"]

def player_name(game, id):
	"""A player's name from our own row. Events carry a name too, but the row is what the recipient chose to store when the game was created, so a peer cannot rename itself per move."""
	return game["identity_name"] if id == game["identity"] else game["opponent_name"]

GAME_COLUMNS = ["fen", "pgn", "status", "winner", "draw_offer"]
GAME_TERMINAL = ["checkmate", "stalemate", "draw", "resigned"]

# Columns a websocket payload may carry. Everything this game holds is
# visible to both players, so the public set is the whole snapshot -
# unlike words, which must hold back racks and the bag.
GAME_PUBLIC = GAME_COLUMNS

# Standard algebraic notation's alphabet: pieces, files, ranks, capture,
# castling, promotion, check and mate. A move's notation is stored, pushed to
# the opponent and put in their notification, so nothing else may pass as one.
NOTATION = "^[KQRBNa-h1-8xO=+#-]{2,10}$"

def game_players(game):
	"""Entities entitled to write this game's state."""
	return [game["identity"], game["opponent"]]

def game_snapshot_valid(game, state):
	"""Validate a complete inbound snapshot; snapshot columns bypass the per-handler field checks, so without this any event type could set an arbitrary status or winner."""
	# Every text column is text before anything else looks at it, so an empty
	# value can only be "": a list or a number passed the falsy tests below, and
	# was then bound into the update or stored and sent on in every later
	# snapshot.
	for column in ["fen", "pgn", "status", "winner", "draw_offer"]:
		if not textual(state[column]):
			return False
	if not valid_fen(state["fen"]):
		return False
	if len(state["pgn"]) > 10000:
		return False
	if state["status"] not in ["active", "checkmate", "stalemate", "draw", "resigned"]:
		return False
	players = [game["identity"], game["opponent"]]
	if state["winner"] and state["winner"] not in players:
		return False
	if state["draw_offer"] and state["draw_offer"] not in players:
		return False
	return True

# What lib/games.star needs of this app.
GAME = {
	"service": "chess",
	"columns": GAME_COLUMNS,
	"terminal": GAME_TERMINAL,
	"public": GAME_PUBLIC,
	"players": game_players,
	"valid": game_snapshot_valid,
	"name": player_name,
	"hook": chess_ensure_commit_hook,
	"outsider": "errors.not_a_player_in_this_game",
}

# Load game by ID from action input, validate ID and player access
def load_game(a):
	return game_load(GAME, a)

def valid_square(s):
	return len(s) == 2 and s[0] in "abcdefgh" and s[1] in "12345678"

# Validate a chess FEN string
def valid_fen(fen):
	if not textual(fen):
		return False
	if not fen or len(fen) > 200:
		return False
	parts = fen.split(" ")
	# All six FEN fields, not just the board. The turn check in action_move
	# reads parts[1] and chess.js load() throws on an incomplete FEN, so a
	# board-only string that passed here crash-looped the opponent's view.
	if len(parts) != 6:
		return False
	if parts[1] not in ["w", "b"]:
		return False
	rows = parts[0].split("/")
	if len(rows) != 8:
		return False
	valid_chars = "rnbqkpRNBQKP12345678"
	for row in rows:
		count = 0
		for ch in row.elems():
			if ch not in valid_chars:
				return False
			if ch >= "1" and ch <= "8":
				count = count + int(ch)
			else:
				count = count + 1
		if count != 8:
			return False
	return True

# Create new game
def action_create(a):
	opponent = a.input("opponent")
	if not mochi.text.valid(opponent, "entity"):
		a.error.label(400, "errors.invalid_opponent")
		return

	if opponent == a.user.identity.id:
		a.error.label(400, "errors.cannot_play_against_yourself")
		return

	# Verify opponent is a friend
	friend = mochi.service.call("friends", "get", a.user.identity.id, opponent)
	if not friend:
		a.error.label(400, "errors.can_only_play_with_friends")
		return

	opponent_name = friend["name"]

	# Randomly assign white (fair 50/50)
	if mochi.random.integer(0, 1) == 0:
		white = a.user.identity.id
	else:
		white = opponent

	game_id = mochi.uid()
	now = mochi.time.now()
	key = mochi.random.alphanumeric(16)

	mochi.db.execute(
		"insert into games ( id, identity, identity_name, opponent, opponent_name, white, key, updated, created ) values ( ?, ?, ?, ?, ?, ?, ?, ?, ? )",
		game_id, a.user.identity.id, a.user.identity.name, opponent, opponent_name, white, key, now, now
	)

	# Send new game event to opponent
	mochi.message.send(
		{"from": a.user.identity.id, "to": opponent, "service": "chess", "event": "new"},
		{"id": game_id, "identity": a.user.identity.id, "identity_name": a.user.identity.name, "opponent": opponent, "opponent_name": opponent_name, "white": white, "created": now}
	)

	return {
		"data": {"id": game_id, "white": white}
	}

# List games
def action_list(a):
	games = mochi.db.rows("""
		select id, identity, identity_name, opponent, opponent_name, white, status, winner, fen, draw_offer, updated, created from games
		where identity=? or opponent=?
		order by updated desc
	""", a.user.identity.id, a.user.identity.id)

	return {
		"data": games
	}

# View a game
def action_view(a):
	game = load_game(a)
	if not game:
		return

	mochi.service.call("notifications", "clear/object", game["id"])

	return {
		"data": {"game": game, "identity": a.user.identity.id}
	}

# Get messages for a game with cursor-based pagination
def action_messages(a):
	return game_messages(GAME, a)

# Send a chat message
def action_send(a):
	return chat_send(GAME, a)

# Make a move
def action_move(a):
	game = load_game(a)
	if not game:
		return

	if game["status"] != "active":
		a.error.label(400, "errors.game_is_not_active")
		return

	# Validate turn. The active-colour field is the 2nd space-separated FEN
	# token ("w" or "b"); read it directly rather than substring-matching.
	fen_parts = game["fen"].split(" ")
	turn = fen_parts[1] if len(fen_parts) > 1 else "w"
	player_color = "w" if game["white"] == a.user.identity.id else "b"
	if turn != player_color:
		a.error.label(400, "errors.not_your_turn")
		return

	# Get move data from frontend
	move_from = a.input("from")
	move_to = a.input("to")
	promotion = a.input("promotion", "")
	fen = a.input("fen")
	pgn = a.input("pgn")
	san = a.input("san")
	status = a.input("status", "")
	winner = a.input("winner", "")

	if not move_from or not move_to or not fen or not san:
		a.error.label(400, "errors.missing_move_data")
		return
	if not valid_square(move_from) or not valid_square(move_to):
		a.error.label(400, "errors.invalid_square")
		return
	if promotion and promotion not in ("q", "r", "b", "n"):
		a.error.label(400, "errors.invalid_promotion")
		return

	if not mochi.text.valid(san, NOTATION):
		a.error.label(400, "errors.invalid_move_notation")
		return
	if not valid_fen(fen):
		a.error.label(400, "errors.invalid_board_state")
		return
	if pgn and len(pgn) > 10000:
		a.error.label(400, "errors.pgn_too_long")
		return

	# Validate status and winner
	valid_statuses = ["active", "checkmate", "stalemate", "draw"]
	new_status = status if status in valid_statuses else "active"
	# The pair, not white: every other player check in this file uses it, and
	# deriving from white puts whatever white holds into the allowlist.
	players = [game["identity"], game["opponent"]]
	new_winner = winner if winner in players else None

	chess_ensure_commit_hook()
	now = mochi.time.now()
	# Compare-and-swap on the version tuple the turn was validated against:
	# nothing serialises HTTP actions for a (user, app), so a double submit or
	# a simultaneous opponent move would otherwise both pass. Every state change
	# advances the tuple, a resignation or a draw offer included, so a move made
	# against a row one of them has since changed loses the swap.
	state = game_write(GAME, game, {"fen": fen, "pgn": pgn or "", "status": new_status,
		"winner": new_winner, "draw_offer": None}, a.user.identity.id, now)
	if state == None:
		a.error.label(409, "errors.game_state_changed")
		return


	# Insert move message
	id = mochi.uid()
	mochi.db.execute("insert into messages ( id, game, member, name, body, type, created ) values ( ?, ?, ?, ?, ?, 'move', ? )", id, game["id"], a.user.identity.id, a.user.identity.name, san, now)

	# The live push fires from chess_commit_hook, which adds the games row state
	# landed above.
	mochi.db.commit.fire("messages", "insert", id)

	other = get_opponent(game, a.user.identity.id)

	# No row id: the opponent keys its own row, since an id chosen here could
	# name a row it already holds.
	p2p_data = {
		"game": game["id"], "created": now, "name": a.user.identity.name,
		"body": san, "from": move_from, "to": move_to, "promotion": promotion,
		# Retained for peers that predate the snapshot: they read the board
		# fields directly and check the position this move followed from.
		"parent": game["fen"]
	}
	# The complete post-move state plus its version tuple. Merged last so the
	# snapshot is authoritative over anything named above.
	for key, value in state.items():
		p2p_data[key] = value
	mochi.message.send(
		{"from": a.user.identity.id, "to": other, "service": "chess", "event": "move"},
		p2p_data
	)

	return {
		"data": {"id": id}
	}

# Resign
def action_resign(a):
	return game_resign(GAME, a)

# Offer a draw
def action_draw_offer(a):
	return draw_offer(GAME, a)

# Accept a draw offer
def action_draw_accept(a):
	return draw_accept(GAME, a)

# Decline a draw offer
def action_draw_decline(a):
	return draw_decline(GAME, a)

# Delete a finished game
def action_delete(a):
	return game_delete(GAME, a)

# P2P Events

# Received a new game event
def event_new(e):
	f = mochi.service.call("friends", "get", e.header("to"), e.header("from"))
	if not f:
		return

	# Every field is decoded JSON under the peer's control: mochi.text.valid
	# raises on a non-string, which would abort the handler and mail the
	# administrator on every redelivery, so each is read as text first.
	game_id = str(e.content("id") or "")
	if not mochi.text.valid(game_id, "id"):
		return

	identity = str(e.content("identity") or "")
	if not mochi.text.valid(identity, "entity"):
		return

	opponent = str(e.content("opponent") or "")
	if not mochi.text.valid(opponent, "entity"):
		return

	opponent_name = str(e.content("opponent_name") or "")
	if not mochi.text.valid(opponent_name, "name"):
		return

	white = str(e.content("white") or "")
	if not mochi.text.valid(white, "entity"):
		return
	# Bind white to this game's two players. Well-formed is not enough: white is
	# what action_move derives its winner allowlist from, so a third entity here
	# both admits a non-player as winner and excludes the real opponent.
	if white not in [identity, opponent]:
		return

	created = event_created(e, mochi.time.now())
	if created == None:
		return

	# Verify the recipient is one of the two players - a friend must not be able
	# to plant a game row in which this user is not a participant.
	if e.header("to") not in [identity, opponent]:
		return

	# ...and that the sender is the creator. The friend check above only proves
	# the sender is OUR friend: naming us as the creator would plant a game we
	# never started, under whatever creator name the sender chose. The creator's
	# name is the friend record's, not the wire's, for the same reason.
	if e.header("from") != identity:
		return
	identity_name = str(f["name"] or "")
	if not mochi.text.valid(identity_name, "name"):
		return

	result = mochi.db.execute(
		"insert or ignore into games ( id, identity, identity_name, opponent, opponent_name, white, key, updated, created ) values ( ?, ?, ?, ?, ?, ?, ?, ?, ? )",
		game_id, identity, identity_name, opponent, opponent_name, white, mochi.random.alphanumeric(16), mochi.time.now(), created
	)
	if result == 0:
		return

	notify("activity", game_id, mochi.app.label("notifications.title.game"), mochi.app.label("notifications.body.started_game", name=identity_name), "/chess/" + game_id, event_id="game:" + game_id, name=identity_name)

# Received a move event
def event_move(e):
	game = game_event(GAME, e)
	if not game:
		return
	sender = e.header("from")

	fen = e.content("fen")
	pgn = e.content("pgn") or ""
	san = e.content("body")

	# Gates, not values: game_apply re-reads and re-validates fen, pgn, status
	# and winner from the snapshot, so a local copy would be discarded. Only san
	# is consumed below. Refuse a malformed event here rather than carrying it.
	if not fen or not san:
		return
	if not valid_fen(fen):
		return
	if not textual(pgn) or len(pgn) > 10000:
		return
	# The move is the sender's own, so the position it leaves has the OTHER
	# colour to play. Judged on the payload alone: a gate on our stored turn
	# would refuse every later move once one snapshot had been refused.
	if fen.split(" ")[1] == ("w" if game["white"] == sender else "b"):
		return

	# Apply atomically, ordered by the sender's tuple: a read-then-write loses to a
	# concurrent local move, and core's inbound dedup is in memory only, so a retry
	# after a lost ack can arrive looking new.
	now = mochi.time.now()
	if game_apply(GAME, e, game, now) == None:
		return

	created = event_created(e, now)
	if created == None:
		created = now

	name = player_name(game, sender)
	# The notation as action_move accepts it; anything else - a megabyte, or
	# text that is no move at all - is shown as an unknown move, since it lands
	# in the messages row and the notification, and refusing it would drop an
	# otherwise-good move.
	san = event_body(san, 10, "?")
	if not mochi.text.valid(san, NOTATION):
		san = "?"

	chess_ensure_commit_hook()
	# Our own id: the version tuple has already refused a redelivery, and an id
	# the peer chose could name a row we hold, leaving an applied move with no
	# row, no frame and no notification.
	id = mochi.uid()
	mochi.db.execute("insert into messages ( id, game, member, name, body, type, created ) values ( ?, ?, ?, ?, ?, 'move', ? )", id, game["id"], sender, name, san, created)

	# Live-update websocket: routes through chess_commit_hook now that
	# the same payload is reconstructible from the games + messages
	# rows the update above just landed.
	mochi.db.commit.fire("messages", "insert", id)
	notify("activity", game["id"], mochi.app.label("notifications.title.move"), mochi.app.label("notifications.body.played_move", name=name, move=san), "/chess/" + game["id"], event_id="move:" + id, name=name)

# Received a peer's dominating state after they rejected one of ours
def event_sync(e):
	game_sync(GAME, e)

# Received a chat message event
def event_message(e):
	chat_receive(GAME, e)

# Received a resign event
def event_resign(e):
	game_resigned(GAME, e)

# Received a draw offer event
def event_draw_offer(e):
	draw_offered(GAME, e)

# Received a draw accept event
def event_draw_accept(e):
	draw_accepted(GAME, e)

# Received a draw decline event
def event_draw_decline(e):
	draw_declined(GAME, e)
