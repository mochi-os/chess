# Copyright © 2026 Mochi OÜ
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
	if before_str and mochi.text.valid(before_str, "natural"):
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
	mochi.db.execute(
		"update games set fen=?, pgn=?, status=?, winner=?, draw_offer=null, updated=? where id=?",
		fen, pgn or "", new_status, new_winner, now, game["id"]
	)

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

	mochi.message.send(
		{"from": a.user.identity.id, "to": other, "service": "chess", "event": "move"},
		{
			"game": game["id"], "message": id, "created": now, "name": a.user.identity.name,
			"body": san, "from": move_from, "to": move_to, "promotion": promotion,
			"fen": fen, "pgn": pgn or "", "status": new_status, "winner": new_winner or ""
		}
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
	mochi.db.execute("update games set status='resigned', winner=?, updated=? where id=?", winner, now, game["id"])

	# Insert system message
	id = mochi.uid()
	msg = a.user.identity.name + " resigned"
	mochi.db.execute("insert into messages ( id, game, member, name, body, type, event, created ) values ( ?, ?, ?, ?, ?, 'system', 'resign', ? )", id, game["id"], a.user.identity.id, a.user.identity.name, msg, now)

	# Kept on direct websocket.write: resign / draw_offer / draw_accept /
	# draw_decline all funnel through messages.insert with type 'system'
	# and the commit hook can't tell them apart from row state alone.
	# `name` lets the frontend render the localised system text per viewer.
	mochi.websocket.write(game["key"], {"type": "system", "event": "resign", "name": a.user.identity.name, "created": now, "body": msg, "winner": winner})

	mochi.message.send(
		{"from": a.user.identity.id, "to": other, "service": "chess", "event": "resign"},
		{"game": game["id"], "created": now, "body": msg, "winner": winner}
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
	mochi.db.execute("update games set draw_offer=?, updated=? where id=?", a.user.identity.id, now, game["id"])

	# Insert system message
	id = mochi.uid()
	msg = a.user.identity.name + " offered a draw"
	mochi.db.execute("insert into messages ( id, game, member, name, body, type, event, created ) values ( ?, ?, ?, ?, ?, 'system', 'draw_offer', ? )", id, game["id"], a.user.identity.id, a.user.identity.name, msg, now)

	# Kept on direct websocket.write: type='system' is multi-semantic;
	# see chess_commit_hook for the rationale.
	mochi.websocket.write(game["key"], {"type": "system", "event": "draw_offer", "name": a.user.identity.name, "created": now, "body": msg, "draw_offer": a.user.identity.id})

	mochi.message.send(
		{"from": a.user.identity.id, "to": other, "service": "chess", "event": "draw_offer"},
		{"game": game["id"], "created": now, "body": msg, "draw_offer": a.user.identity.id}
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
	mochi.db.execute("update games set status='draw', draw_offer=null, updated=? where id=?", now, game["id"])

	# Insert system message
	id = mochi.uid()
	msg = "Draw agreed"
	mochi.db.execute("insert into messages ( id, game, member, name, body, type, event, created ) values ( ?, ?, ?, ?, ?, 'system', 'draw_accept', ? )", id, game["id"], a.user.identity.id, a.user.identity.name, msg, now)

	# Kept on direct websocket.write: type='system' is multi-semantic;
	# see chess_commit_hook for the rationale.
	mochi.websocket.write(game["key"], {"type": "system", "event": "draw_accept", "name": a.user.identity.name, "created": now, "body": msg})

	mochi.message.send(
		{"from": a.user.identity.id, "to": other, "service": "chess", "event": "draw_accept"},
		{"game": game["id"], "created": now, "body": msg}
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
	mochi.db.execute("update games set draw_offer=null, updated=? where id=?", now, game["id"])

	# Insert system message
	id = mochi.uid()
	msg = a.user.identity.name + " declined the draw"
	mochi.db.execute("insert into messages ( id, game, member, name, body, type, event, created ) values ( ?, ?, ?, ?, ?, 'system', 'draw_decline', ? )", id, game["id"], a.user.identity.id, a.user.identity.name, msg, now)

	# Kept on direct websocket.write: type='system' is multi-semantic;
	# see chess_commit_hook for the rationale.
	mochi.websocket.write(game["key"], {"type": "system", "event": "draw_decline", "name": a.user.identity.name, "created": now, "body": msg, "draw_offer": ""})

	mochi.message.send(
		{"from": a.user.identity.id, "to": other, "service": "chess", "event": "draw_decline"},
		{"game": game["id"], "created": now, "body": msg}
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

	now = mochi.time.now()
	mochi.db.execute("update games set fen=?, pgn=?, status=?, winner=?, draw_offer=null, updated=? where id=?", fen, pgn, status, winner, now, game["id"])

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
	mochi.db.execute("update games set status='resigned', winner=?, updated=? where id=?", winner, now, game["id"])

	id = mochi.uid()
	mochi.db.execute("insert into messages ( id, game, member, name, body, type, event, created ) values ( ?, ?, ?, ?, ?, 'system', 'resign', ? )", id, game["id"], sender, sender_name, body, now)

	# Kept on direct websocket.write: type='system' is multi-semantic;
	# see chess_commit_hook for the rationale.
	mochi.websocket.write(game["key"], {"type": "system", "event": "resign", "name": sender_name, "created": now, "body": body, "winner": winner or ""})
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

	# LWW gate: both players can offer draw concurrently from different
	# hosts. Use the sender's `created` (the action's local now at offer
	# time) and only apply if it's strictly newer than what we've
	# recorded. The action always includes `created`; fall back to local
	# now for safety against malformed events.
	now = mochi.time.now()
	incoming = str(e.content("created", "0"))
	if mochi.text.valid(incoming, "integer"):
		incoming = int(incoming)
	else:
		incoming = now
	if game["updated"] and incoming <= game["updated"]:
		return

	mochi.db.execute("update games set draw_offer=?, updated=? where id=?", sender, incoming, game["id"])

	id = mochi.uid()
	mochi.db.execute("insert into messages ( id, game, member, name, body, type, event, created ) values ( ?, ?, ?, ?, ?, 'system', 'draw_offer', ? )", id, game["id"], sender, sender_name, body, now)

	# Kept on direct websocket.write: type='system' is multi-semantic;
	# see chess_commit_hook for the rationale.
	mochi.websocket.write(game["key"], {"type": "system", "event": "draw_offer", "name": sender_name, "created": now, "body": body, "draw_offer": sender})
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
	mochi.db.execute("update games set status='draw', draw_offer=null, updated=? where id=?", now, game["id"])

	id = mochi.uid()
	mochi.db.execute("insert into messages ( id, game, member, name, body, type, event, created ) values ( ?, ?, ?, ?, ?, 'system', 'draw_accept', ? )", id, game["id"], sender, sender_name, body, now)

	# Kept on direct websocket.write: type='system' is multi-semantic;
	# see chess_commit_hook for the rationale.
	mochi.websocket.write(game["key"], {"type": "system", "event": "draw_accept", "name": sender_name, "created": now, "body": body})
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
	mochi.db.execute("update games set draw_offer=null, updated=? where id=?", now, game["id"])

	id = mochi.uid()
	mochi.db.execute("insert into messages ( id, game, member, name, body, type, event, created ) values ( ?, ?, ?, ?, ?, 'system', 'draw_decline', ? )", id, game["id"], sender, sender_name, body, now)

	# Kept on direct websocket.write: type='system' is multi-semantic;
	# see chess_commit_hook for the rationale.
	mochi.websocket.write(game["key"], {"type": "system", "event": "draw_decline", "name": sender_name, "created": now, "body": body, "draw_offer": ""})
	notify("activity", "", mochi.app.label("notifications.title.chess"), mochi.app.label("notifications.body.draw_declined"), "/chess/" + game["id"], event_id="draw_decline:" + game["id"] + ":" + sender)

