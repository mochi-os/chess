# Copyright © 2026 Mochisoft OÜ
# SPDX-License-Identifier: AGPL-3.0-only
# This file is part of Mochi, licensed under the GNU AGPL v3 with the
# Mochi Application Interface Exception - see license.txt and license-exception.md.

# Mochi Chess app

def notify(topic, object="", title="", body="", url="", event_id=""):
	mochi.service.call("notifications", "send", topic, object, title, body, url, mochi.app.label("notifications.topic." + topic.replace("/", ".")), "", "", None, event_id)

# Commit hook: fires the live-update websocket on every host that sees
# a new messages row commit, whether locally (via action_send /
# action_move / event_message / event_move calling
# mochi.db.commit.fire) or via replication apply (auto-fired by core
# with op.UID set, per the row-uid wire field added in #36). Both
# replicas of a paired account thus see the live update in any open
# browser tab, instead of only the host that served the action.
#
# Scope: messages.insert with type 'message' or 'move'. Move payloads
# enrich the message row with current game state (fen / pgn / status /
# winner / draw_offer) read from the games row, which the move action
# updated immediately before inserting the message row.
#
# Skipped: type 'system' messages (resign / draw_offer / draw_accept /
# draw_decline). They all funnel through messages.insert with the
# same shape, and the hook can't disambiguate the four distinct
# semantic events from the row state alone — disambiguating from the
# games row state is fragile under replication-apply reordering. They
# stay on direct mochi.websocket.write for now; paired-host clients
# won't see them live until they refresh, the same behaviour they had
# before any of this conversion.
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
		# Version tuple. A scalar counter each peer increments locally is not
		# a total order: two peers can both commit a different state at N+1
		# and then reject each other forever. Ordering is now
		# (terminal, revision, writer, event) compared lexicographically, so
		# concurrent writes resolve to the same winner on every peer.
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
		# Drop the pre-2026-07 broadcast tables left in the app data DB when
		# broadcast state moved to the per-app system DB - inert, but stale
		# sequence/log copies mislead diagnosis.
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

def action_new(a):
	friends = mochi.service.call("friends", "list", a.user.identity.id) or []
	return {
		"data": {"friends": friends}
	}

def get_opponent(game, user_id):
	if game["identity"] == user_id:
		return game["opponent"]
	return game["identity"]

# Concurrency and convergence.
#
# Two problems, one mechanism.
#
# Locally, nothing serialises HTTP actions for a (user, app): core's
# per-worker guarantee (protocol2_worker.go) covers inbound P2P frames
# only. Two HTTP actions, or an HTTP action and an inbound event, can
# read the same row and write over each other.
#
# Between peers, there is no coordinator. A scalar counter that each peer
# increments from its own state is NOT a total order - both peers can
# commit a different state at N+1 (two players offering a draw at the
# same moment, or resigning), and a strictly-greater test then makes each
# reject the other permanently.
#
# Ordering is therefore the tuple (terminal, revision, writer, event),
# compared lexicographically:
#
#   revision  the logical counter, and it leads. An earlier version put
#             terminal first, which made EVERY terminal state outrank every
#             non-terminal one at any counter: a player resigning from a
#             stale revision-4 view then rewound peers at revision 30 to
#             revision-4 boards, racks and scores. Causality first.
#   terminal  1 when the status ends the game, else 0. Second, so it decides
#             only genuine same-counter conflicts - a resignation racing a
#             move at the same revision survives on both peers - without
#             letting an ancient terminal defeat newer state. A resignation
#             made against a state that no longer exists is discarded, and
#             the player reissues it once caught up.
#   writer    the entity that produced the state. Breaks ties between
#             peers at the same counter, identically on both sides.
#   event     a per-write uid. Only reachable if one writer produced two
#             states at the same counter, which the local CAS prevents;
#             carried so the order is total without relying on that.
#
# Every event carries a COMPLETE snapshot of the shared columns, not a
# delta. A delta would make "revision already passed" mean the state was
# passed, which is false: applying a higher auxiliary event (a resign)
# would advance the counter while omitting a board carried only by a
# lower one, and that lower event is then rejected for good - core acks
# any handler that returns cleanly (protocol2_worker.go), so nothing
# retries it.

GAME_COLUMNS = ["fen", "pgn", "status", "winner", "draw_offer"]
GAME_TERMINAL = ["checkmate", "stalemate", "draw", "resigned"]

def game_terminal(status):
	return 1 if status in GAME_TERMINAL else 0

def game_state(game, changes):
	"""Complete shared state: the row we read with changes applied.

	None becomes "" so a nullable column survives the round trip through
	an event; 0 and False are preserved, which `or ""` would not."""
	state = {}
	for column in GAME_COLUMNS:
		value = game[column]
		state[column] = "" if value == None else value
	for key, value in changes.items():
		state[key] = "" if value == None else value
	return state

def game_snapshot_valid(game, state):
	"""Validate a complete inbound snapshot before it can replace our row.

	Snapshot mode reads the columns straight off the event, so the checks
	each handler runs on its own fields do not apply to it. Without this a
	peer could set an arbitrary status or winner through any event type."""
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

def game_write(game, changes, writer, now):
	"""Apply a local change, guarding on the exact tuple we read.

	Returns the complete new state to ship to the opponent, or None when
	another writer got there first - in which case the caller must
	abandon the change entirely, emitting no message, no websocket
	payload and no P2P event."""
	state = game_state(game, changes)
	sets = []
	params = []
	for column in GAME_COLUMNS:
		sets.append(column + "=?")
		params.append(state[column])
	revision = game["revision"] + 1
	event = mochi.uid()
	sql = "update games set " + ", ".join(sets) + ", revision=?, writer=?, event=?, updated=? where id=? and revision=? and writer=? and event=?"
	params.extend([revision, writer, event, now, game["id"], game["revision"], game["writer"] or "", game["event"] or ""])
	if mochi.db.execute(sql, *params) == 0:
		return None
	state["revision"] = revision
	state["writer"] = writer
	state["event"] = event
	state["snapshot"] = 1
	return state

def game_apply(e, game, legacy, now):
	"""Apply an inbound change if it outranks the row we hold.

	Peers on this version send a complete snapshot and the full tuple.
	A peer predating it sends neither, so the caller's `legacy` dict of
	partial changes is applied under a tuple of (terminal, our revision
	+ 1, "", "") - atomic against local writers exactly as before, but
	still a delta, so state can lag a legacy sender until both sides are
	upgraded."""
	if e.content("snapshot"):
		state = {}
		for column in GAME_COLUMNS:
			value = e.content(column)
			# A field absent from a snapshot is a truncated snapshot, not an
			# empty value: coercing it to "" would let a partial event clear
			# state the sender never meant to change.
			if value == None:
				return None
			state[column] = value
		if not game_snapshot_valid(game, state):
			return None
		revision = e.content("revision")
		if not mochi.text.valid(str(revision), "integer"):
			return None
		revision = int(revision)
		writer = e.content("writer") or ""
		event = e.content("event") or ""
	else:
		state = {}
		for key, value in legacy.items():
			state[key] = "" if value == None else value
		if "status" not in state:
			state["status"] = game["status"]
		revision = game["revision"] + 1
		writer = ""
		event = ""

	sets = []
	params = []
	for column, value in state.items():
		sets.append(column + "=?")
		params.append(value)
	sql = ("update games set " + ", ".join(sets) +
		", revision=?, writer=?, event=?, updated=? where id=?" +
		" and (revision, case when status in ('checkmate','stalemate','draw','resigned') then 1 else 0 end, writer, event) < (?, ?, ?, ?)")
	params.extend([revision, writer, event, now, game["id"],
		revision, game_terminal(state["status"]), writer, event])
	if mochi.db.execute(sql, *params) == 0:
		return None
	return state

# Load game by ID from action input, validate ID and player access
def load_game(a):
	if not mochi.text.valid(a.input("game"), "id"):
		a.error.label(400, "errors.invalid_game_id")
		return None
	game = mochi.db.row("select * from games where id=?", a.input("game"))
	if not game:
		a.error.label(404, "errors.game_not_found")
		return None
	if game["identity"] != a.user.identity.id and game["opponent"] != a.user.identity.id:
		a.error.label(403, "errors.not_a_player_in_this_game")
		return None
	return game

# Validate a chess FEN string
def valid_square(s):
	return len(s) == 2 and s[0] in "abcdefgh" and s[1] in "12345678"

def valid_fen(fen):
	if not fen or len(fen) > 200:
		return False
	parts = fen.split(" ")
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
		SELECT id, identity, identity_name, opponent, opponent_name, white, status, winner, fen, pgn, draw_offer, updated, created FROM games
		WHERE identity = ? OR opponent = ?
		ORDER BY updated DESC
	""", a.user.identity.id, a.user.identity.id)

	return {
		"data": games
	}

# View a game
def action_view(a):
	game = load_game(a)
	if not game:
		return

	mochi.service.call("notifications", "clear/object", "chess", game["id"])

	return {
		"data": {"game": game, "identity": a.user.identity.id}
	}

# Get messages for a game with cursor-based pagination
def action_messages(a):
	game = load_game(a)
	if not game:
		return

	# Pagination parameters
	limit = 30
	limit_str = a.input("limit")
	if limit_str and mochi.text.valid(limit_str, "natural"):
		limit = min(int(limit_str), 100)

	before = None
	before_str = a.input("before")
	if before_str and mochi.text.valid(before_str, "integer"):
		before = int(before_str)

	if before:
		messages = mochi.db.rows("select * from messages where game=? and created<? order by created desc limit ?", game["id"], before, limit + 1)
	else:
		messages = mochi.db.rows("select * from messages where game=? order by created desc limit ?", game["id"], limit + 1)

	has_more = len(messages) > limit
	if has_more:
		messages = messages[:limit]

	messages = list(reversed(messages))

	next_cursor = None
	if has_more and len(messages) > 0:
		next_cursor = messages[0]["created"]

	return {
		"data": {
			"messages": messages,
			"hasMore": has_more,
			"nextCursor": next_cursor
		}
	}

# Send a chat message
def action_send(a):
	game = load_game(a)
	if not game:
		return

	body = a.input("body", "")
	if not mochi.text.valid(body, "text"):
		a.error.label(400, "errors.invalid_message")
		return
	if len(body) > 10000:
		a.error.label(400, "errors.message_too_long")
		return
	if not body.strip():
		a.error.label(400, "errors.message_cannot_be_empty")
		return

	chess_ensure_commit_hook()
	id = mochi.uid()
	now = mochi.time.now()
	mochi.db.execute("insert into messages ( id, game, member, name, body, type, created ) values ( ?, ?, ?, ?, ?, 'message', ? )", id, game["id"], a.user.identity.id, a.user.identity.name, body, now)

	# Live-update websocket: fired from chess_commit_hook on every host
	# that sees this messages row (local + paired replicas via the
	# row-uid wire field from #36), so the user's tabs on every host
	# see the message arrive without a refresh.
	mochi.db.commit.fire("messages", "insert", id)

	other = get_opponent(game, a.user.identity.id)

	mochi.message.send(
		{"from": a.user.identity.id, "to": other, "service": "chess", "event": "message"},
		{"game": game["id"], "message": id, "created": now, "body": body, "name": a.user.identity.name}
	)

	return {
		"data": {"id": id}
	}

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

	if len(san) > 10:
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
	black = game["opponent"] if game["white"] == game["identity"] else game["identity"]
	players = [game["white"], black]
	new_winner = winner if winner in players else None

	chess_ensure_commit_hook()
	now = mochi.time.now()
	# Compare-and-swap against the position we validated the turn against.
	# Nothing serialises HTTP actions for a (user, app) - core's per-worker
	# guarantee covers inbound P2P frames only - so a double submit, or the
	# opponent's move landing in the same instant, otherwise lets both
	# requests validate the same turn and the later write wins blind.
	# status is in the predicate because a resignation arriving in that
	# window changes the row without touching the FEN.
	state = game_write(game, {"fen": fen, "pgn": pgn or "", "status": new_status,
		"winner": new_winner, "draw_offer": None}, a.user.identity.id, now)
	if state == None:
		a.error.label(409, "errors.game_state_changed")
		return


	# Insert move message
	id = mochi.uid()
	mochi.db.execute("insert into messages ( id, game, member, name, body, type, created ) values ( ?, ?, ?, ?, ?, 'move', ? )", id, game["id"], a.user.identity.id, a.user.identity.name, san, now)

	# Live-update websocket: fired from chess_commit_hook on every host
	# that sees this messages row. The hook enriches the move payload
	# with current games row state (fen / pgn / status / winner /
	# draw_offer) — which the update above just landed — so paired
	# hosts emit the same payload shape clients already expect.
	mochi.db.commit.fire("messages", "insert", id)

	other = get_opponent(game, a.user.identity.id)

	p2p_data = {
		"game": game["id"], "message": id, "created": now, "name": a.user.identity.name,
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
	game = load_game(a)
	if not game:
		return

	if game["status"] != "active":
		a.error.label(400, "errors.game_is_not_active")
		return

	# Winner is the opponent
	other = get_opponent(game, a.user.identity.id)
	winner = other

	now = mochi.time.now()
	state = game_write(game, {"status": "resigned", "winner": winner}, a.user.identity.id, now)
	if state == None:
		a.error.label(409, "errors.game_state_changed")
		return


	# Insert system message
	id = mochi.uid()
	msg = a.user.identity.name + " resigned"
	mochi.db.execute("insert into messages ( id, game, member, name, body, type, event, created ) values ( ?, ?, ?, ?, ?, 'system', 'resign', ? )", id, game["id"], a.user.identity.id, a.user.identity.name, msg, now)

	# Kept on direct websocket.write: resign / draw_offer / draw_accept /
	# draw_decline all funnel through messages.insert with type 'system'
	# and the commit hook can't tell them apart from row state alone.
	# `name` lets the frontend render the localised system text per viewer.
	mochi.websocket.write(game["key"], {"type": "system", "event": "resign", "name": a.user.identity.name, "created": now, "body": msg, "winner": winner})

	p2p_data = {"game": game["id"], "created": now, "body": msg}
	for key, value in state.items():
		p2p_data[key] = value
	mochi.message.send(
		{"from": a.user.identity.id, "to": other, "service": "chess", "event": "resign"},
		p2p_data
	)

	return {
		"data": {"success": True}
	}

# Offer a draw
def action_draw_offer(a):
	game = load_game(a)
	if not game:
		return

	if game["status"] != "active":
		a.error.label(400, "errors.game_is_not_active")
		return

	if game["draw_offer"] == a.user.identity.id:
		a.error.label(400, "errors.you_already_offered_a_draw")
		return

	other = get_opponent(game, a.user.identity.id)

	now = mochi.time.now()
	state = game_write(game, {"draw_offer": a.user.identity.id}, a.user.identity.id, now)
	if state == None:
		a.error.label(409, "errors.game_state_changed")
		return


	# Insert system message
	id = mochi.uid()
	msg = a.user.identity.name + " offered a draw"
	mochi.db.execute("insert into messages ( id, game, member, name, body, type, event, created ) values ( ?, ?, ?, ?, ?, 'system', 'draw_offer', ? )", id, game["id"], a.user.identity.id, a.user.identity.name, msg, now)

	# Kept on direct websocket.write: type='system' is multi-semantic;
	# see chess_commit_hook for the rationale.
	mochi.websocket.write(game["key"], {"type": "system", "event": "draw_offer", "name": a.user.identity.name, "created": now, "body": msg, "draw_offer": a.user.identity.id})

	p2p_data = {"game": game["id"], "created": now, "body": msg}
	for key, value in state.items():
		p2p_data[key] = value
	mochi.message.send(
		{"from": a.user.identity.id, "to": other, "service": "chess", "event": "draw_offer"},
		p2p_data
	)

	return {
		"data": {"success": True}
	}

# Accept a draw offer
def action_draw_accept(a):
	game = load_game(a)
	if not game:
		return

	if game["status"] != "active":
		a.error.label(400, "errors.game_is_not_active")
		return

	if not game["draw_offer"] or game["draw_offer"] == a.user.identity.id:
		a.error.label(400, "errors.no_draw_offer_to_accept")
		return

	other = get_opponent(game, a.user.identity.id)

	now = mochi.time.now()
	# A concurrent decline advances the tuple, so this accept loses the CAS
	# rather than both emitting a contradictory system message.
	state = game_write(game, {"status": "draw", "draw_offer": None}, a.user.identity.id, now)
	if state == None:
		a.error.label(409, "errors.game_state_changed")
		return


	# Insert system message
	id = mochi.uid()
	msg = "Draw agreed"
	mochi.db.execute("insert into messages ( id, game, member, name, body, type, event, created ) values ( ?, ?, ?, ?, ?, 'system', 'draw_accept', ? )", id, game["id"], a.user.identity.id, a.user.identity.name, msg, now)

	# Kept on direct websocket.write: type='system' is multi-semantic;
	# see chess_commit_hook for the rationale.
	mochi.websocket.write(game["key"], {"type": "system", "event": "draw_accept", "name": a.user.identity.name, "created": now, "body": msg})

	p2p_data = {"game": game["id"], "created": now, "body": msg}
	for key, value in state.items():
		p2p_data[key] = value
	mochi.message.send(
		{"from": a.user.identity.id, "to": other, "service": "chess", "event": "draw_accept"},
		p2p_data
	)

	return {
		"data": {"success": True}
	}

# Decline a draw offer
def action_draw_decline(a):
	game = load_game(a)
	if not game:
		return

	if game["status"] != "active":
		a.error.label(400, "errors.game_is_not_active")
		return

	if not game["draw_offer"] or game["draw_offer"] == a.user.identity.id:
		a.error.label(400, "errors.no_draw_offer_to_decline")
		return

	other = get_opponent(game, a.user.identity.id)

	now = mochi.time.now()
	state = game_write(game, {"draw_offer": None}, a.user.identity.id, now)
	if state == None:
		a.error.label(409, "errors.game_state_changed")
		return


	# Insert system message
	id = mochi.uid()
	msg = a.user.identity.name + " declined the draw"
	mochi.db.execute("insert into messages ( id, game, member, name, body, type, event, created ) values ( ?, ?, ?, ?, ?, 'system', 'draw_decline', ? )", id, game["id"], a.user.identity.id, a.user.identity.name, msg, now)

	# Kept on direct websocket.write: type='system' is multi-semantic;
	# see chess_commit_hook for the rationale.
	mochi.websocket.write(game["key"], {"type": "system", "event": "draw_decline", "name": a.user.identity.name, "created": now, "body": msg, "draw_offer": ""})

	p2p_data = {"game": game["id"], "created": now, "body": msg}
	for key, value in state.items():
		p2p_data[key] = value
	mochi.message.send(
		{"from": a.user.identity.id, "to": other, "service": "chess", "event": "draw_decline"},
		p2p_data
	)

	return {
		"data": {"success": True}
	}

# Delete a finished game
def action_delete(a):
	game = load_game(a)
	if not game:
		return

	if game["status"] == "active":
		a.error.label(400, "errors.cannot_delete_an_active_game")
		return

	mochi.db.execute("delete from messages where game=?", game["id"])
	mochi.db.execute("delete from games where id=?", game["id"])

	return {
		"data": {"success": True}
	}

# P2P Events

# Received a new game event
def event_new(e):
	f = mochi.service.call("friends", "get", e.header("to"), e.header("from"))
	if not f:
		return

	game_id = e.content("id")
	if not mochi.text.valid(game_id, "id"):
		return

	identity = e.content("identity")
	if not mochi.text.valid(identity, "entity"):
		return

	identity_name = e.content("identity_name")
	if not mochi.text.valid(identity_name, "name"):
		return

	opponent = e.content("opponent")
	if not mochi.text.valid(opponent, "entity"):
		return

	opponent_name = e.content("opponent_name")
	if not mochi.text.valid(opponent_name, "name"):
		return

	white = e.content("white")
	if not mochi.text.valid(white, "entity"):
		return

	created = e.content("created")
	if not mochi.text.valid(str(created), "integer"):
		return

	# Verify the recipient is one of the two players - a friend must not be able
	# to plant a game row in which this user is not a participant.
	if e.header("to") not in [identity, opponent]:
		return

	# ...and that the sender is too. The friend check above only proves the
	# sender is OUR friend, not that they are playing: without this a friend
	# could plant a game between us and a third party, who would then satisfy
	# every later is_player check on this host.
	if e.header("from") not in [identity, opponent]:
		return

	result = mochi.db.execute(
		"insert or ignore into games ( id, identity, identity_name, opponent, opponent_name, white, key, updated, created ) values ( ?, ?, ?, ?, ?, ?, ?, ?, ? )",
		game_id, identity, identity_name, opponent, opponent_name, white, mochi.random.alphanumeric(16), mochi.time.now(), created
	)
	if result == 0:
		return

	notify("activity", "", mochi.app.label("notifications.title.game"), mochi.app.label("notifications.body.started_game", name=identity_name), "/chess/" + game_id, event_id="game:" + game_id)

# Received a move event
def event_move(e):
	game = mochi.db.row("select * from games where id=?", e.content("game"))
	if not game:
		return

	# Verify sender is the opponent
	sender = e.header("from")
	if sender != game["identity"] and sender != game["opponent"]:
		return

	fen = e.content("fen")
	pgn = e.content("pgn") or ""
	san = e.content("body")
	status = e.content("status") or "active"
	winner = e.content("winner") or None

	if not fen or not san:
		return
	if not valid_fen(fen):
		return
	if len(pgn) > 10000:
		return

	valid_statuses = ["active", "checkmate", "stalemate", "draw"]
	if status not in valid_statuses:
		status = "active"
	players = [game["identity"], game["opponent"]]
	if winner and winner not in players:
		winner = None

	# Apply atomically, ordered by the sender's revision. The earlier
	# read-then-write shape lost to a concurrent local action: this handler
	# accepted a board, an HTTP move advanced the row, and the unconditional
	# write then erased it. Core dedups inbound frames by id, but that cache
	# is in memory and does not survive a restart, so a retry after a lost
	# ack can also arrive looking new.
	now = mochi.time.now()
	if game_apply(e, game, {"fen": fen, "pgn": pgn, "status": status,
			"winner": winner, "draw_offer": None}, now) == None:
		return

	id = e.content("message")
	if not mochi.text.valid(str(id), "id"):
		id = mochi.uid()

	created = e.content("created")
	if not mochi.text.valid(str(created), "integer"):
		created = now

	name = e.content("name") or "Opponent"

	chess_ensure_commit_hook()
	mochi.db.execute("insert or ignore into messages ( id, game, member, name, body, type, created ) values ( ?, ?, ?, ?, ?, 'move', ? )", id, game["id"], sender, name, san, created)

	# Live-update websocket: routes through chess_commit_hook now that
	# the same payload is reconstructible from the games + messages
	# rows the update above just landed.
	mochi.db.commit.fire("messages", "insert", id)
	notify("activity", "", mochi.app.label("notifications.title.move"), mochi.app.label("notifications.body.played_move", name=name, move=san), "/chess/" + game["id"], event_id="move:" + str(id))

# Received a chat message event
def event_message(e):
	game = mochi.db.row("select * from games where id=?", e.content("game"))
	if not game:
		return

	sender = e.header("from")
	if sender != game["identity"] and sender != game["opponent"]:
		return

	id = e.content("message")
	if not mochi.text.valid(str(id), "id"):
		return

	created = e.content("created")
	if not mochi.text.valid(str(created), "integer"):
		return

	body = e.content("body")
	if not mochi.text.valid(str(body), "text"):
		return
	if len(str(body)) > 10000:
		return

	name = e.content("name") or "Opponent"

	chess_ensure_commit_hook()
	mochi.db.execute("insert or ignore into messages ( id, game, member, name, body, type, created ) values ( ?, ?, ?, ?, ?, 'message', ? )", id, game["id"], sender, name, body, created)

	# Live-update websocket: routes through chess_commit_hook on every
	# host that sees this messages row.
	mochi.db.commit.fire("messages", "insert", id)
	notify("message", "", mochi.app.label("notifications.title.message"), name + ": " + body, "/chess/" + game["id"], event_id="message:" + str(id))

# Received a resign event
def event_resign(e):
	game = mochi.db.row("select * from games where id=?", e.content("game"))
	if not game:
		return

	sender = e.header("from")
	if sender != game["identity"] and sender != game["opponent"]:
		return

	winner = e.content("winner")
	body = e.content("body") or mochi.app.label("notifications.body.opponent_resigned")
	sender_name = game["identity_name"] if sender == game["identity"] else game["opponent_name"]

	# Derive winner: the other player (not the one who resigned)
	players = [game["identity"], game["opponent"]]
	if winner not in players:
		winner = game["opponent"] if sender == game["identity"] else game["identity"]

	now = mochi.time.now()
	state = game_apply(e, game, {"status": "resigned", "winner": winner}, now)
	if state == None:
		return

	id = mochi.uid()
	mochi.db.execute("insert into messages ( id, game, member, name, body, type, event, created ) values ( ?, ?, ?, ?, ?, 'system', 'resign', ? )", id, game["id"], sender, sender_name, body, now)

	# Kept on direct websocket.write: type='system' is multi-semantic;
	# see chess_commit_hook for the rationale.
	ws_data = {"type": "system", "event": "resign", "name": sender_name, "created": now, "body": body, "winner": winner or ""}
	# A snapshot may have repaired more than this event's own subject - a
	# draw offer can carry a board move the peer never received - so send the
	# applied state, not just the fields this event is about. Otherwise an
	# open client keeps the stale board until it refetches.
	for key, value in state.items():
		ws_data[key] = value
	mochi.websocket.write(game["key"], ws_data)
	notify("activity", "", mochi.app.label("notifications.title.game"), mochi.app.label("notifications.body.opponent_resigned"), "/chess/" + game["id"], event_id="resign:" + game["id"])

# Received a draw offer event
def event_draw_offer(e):
	game = mochi.db.row("select * from games where id=?", e.content("game"))
	if not game:
		return

	sender = e.header("from")
	if sender != game["identity"] and sender != game["opponent"]:
		return

	body = e.content("body") or mochi.app.label("notifications.body.draw_offered")
	sender_name = game["identity_name"] if sender == game["identity"] else game["opponent_name"]

	# Ordering is the version tuple, not the wall clock. The gate that used
	# to sit here compared the sender's clock against our `updated` and ran
	# BEFORE the tuple was consulted, so a strictly higher-ordered offer lost
	# to clock skew - or simply to any local move, since every state change
	# bumps `updated`. It was reaching for a deterministic winner when both
	# players offer at once; the tuple's writer element does that properly,
	# and identically on both peers.
	now = mochi.time.now()
	incoming = str(e.content("created", "0"))
	if not mochi.text.valid(incoming, "integer"):
		incoming = str(now)

	state = game_apply(e, game, {"draw_offer": sender}, now)
	if state == None:
		return

	id = mochi.uid()
	mochi.db.execute("insert into messages ( id, game, member, name, body, type, event, created ) values ( ?, ?, ?, ?, ?, 'system', 'draw_offer', ? )", id, game["id"], sender, sender_name, body, now)

	# Kept on direct websocket.write: type='system' is multi-semantic;
	# see chess_commit_hook for the rationale.
	ws_data = {"type": "system", "event": "draw_offer", "name": sender_name, "created": now, "body": body, "draw_offer": sender}
	# A snapshot may have repaired more than this event's own subject - a
	# draw offer can carry a board move the peer never received - so send the
	# applied state, not just the fields this event is about. Otherwise an
	# open client keeps the stale board until it refetches.
	for key, value in state.items():
		ws_data[key] = value
	mochi.websocket.write(game["key"], ws_data)
	notify("activity", "", mochi.app.label("notifications.title.chess"), mochi.app.label("notifications.body.draw_offered"), "/chess/" + game["id"], event_id="draw_offer:" + game["id"] + ":" + str(incoming))

# Received a draw accept event
def event_draw_accept(e):
	game = mochi.db.row("select * from games where id=?", e.content("game"))
	if not game:
		return

	sender = e.header("from")
	if sender != game["identity"] and sender != game["opponent"]:
		return

	body = e.content("body") or mochi.app.label("notifications.body.draw_agreed")
	sender_name = game["identity_name"] if sender == game["identity"] else game["opponent_name"]

	now = mochi.time.now()
	state = game_apply(e, game, {"status": "draw", "draw_offer": None}, now)
	if state == None:
		return

	id = mochi.uid()
	mochi.db.execute("insert into messages ( id, game, member, name, body, type, event, created ) values ( ?, ?, ?, ?, ?, 'system', 'draw_accept', ? )", id, game["id"], sender, sender_name, body, now)

	# Kept on direct websocket.write: type='system' is multi-semantic;
	# see chess_commit_hook for the rationale.
	ws_data = {"type": "system", "event": "draw_accept", "name": sender_name, "created": now, "body": body}
	# A snapshot may have repaired more than this event's own subject - a
	# draw offer can carry a board move the peer never received - so send the
	# applied state, not just the fields this event is about. Otherwise an
	# open client keeps the stale board until it refetches.
	for key, value in state.items():
		ws_data[key] = value
	mochi.websocket.write(game["key"], ws_data)
	notify("activity", "", mochi.app.label("notifications.title.chess"), mochi.app.label("notifications.body.draw_agreed"), "/chess/" + game["id"], event_id="draw_accept:" + game["id"])

# Received a draw decline event
def event_draw_decline(e):
	game = mochi.db.row("select * from games where id=?", e.content("game"))
	if not game:
		return

	sender = e.header("from")
	if sender != game["identity"] and sender != game["opponent"]:
		return

	body = e.content("body") or mochi.app.label("notifications.body.draw_declined")
	sender_name = game["identity_name"] if sender == game["identity"] else game["opponent_name"]

	now = mochi.time.now()
	state = game_apply(e, game, {"draw_offer": None}, now)
	if state == None:
		return

	id = mochi.uid()
	mochi.db.execute("insert into messages ( id, game, member, name, body, type, event, created ) values ( ?, ?, ?, ?, ?, 'system', 'draw_decline', ? )", id, game["id"], sender, sender_name, body, now)

	# Kept on direct websocket.write: type='system' is multi-semantic;
	# see chess_commit_hook for the rationale.
	ws_data = {"type": "system", "event": "draw_decline", "name": sender_name, "created": now, "body": body, "draw_offer": ""}
	# A snapshot may have repaired more than this event's own subject - a
	# draw offer can carry a board move the peer never received - so send the
	# applied state, not just the fields this event is about. Otherwise an
	# open client keeps the stale board until it refetches.
	for key, value in state.items():
		ws_data[key] = value
	mochi.websocket.write(game["key"], ws_data)
	notify("activity", "", mochi.app.label("notifications.title.chess"), mochi.app.label("notifications.body.draw_declined"), "/chess/" + game["id"], event_id="draw_decline:" + game["id"] + ":" + sender)

