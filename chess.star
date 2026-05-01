# Mochi Chess app

def notify(topic, object="", title="", body="", url=""):
	mochi.service.call("notifications", "send", topic, object, title, body, url, mochi.app.label("notifications.topic." + topic.replace("/", ".")))

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
		created integer not null
	)""")
	mochi.db.execute("create index if not exists messages_game_created on messages( game, created )")

# Upgrade database
def database_upgrade(to_version):
	pass

# Get friends list for new game
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
		a.error_label(400, "errors.invalid_game_id")
		return None
	game = mochi.db.row("select * from games where id=?", a.input("game"))
	if not game:
		a.error_label(404, "errors.game_not_found")
		return None
	if game["identity"] != a.user.identity.id and game["opponent"] != a.user.identity.id:
		a.error_label(403, "errors.not_a_player_in_this_game")
		return None
	return game

# Validate a chess FEN string
def valid_square(s):
	return len(s) == 2 and s[0] in "abcdefgh" and s[1] in "12345678"

def valid_fen(fen):
	if not fen or len(fen) > 200:
		return False
	parts = fen.split(" ")
	if len(parts) < 1:
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
		a.error_label(400, "errors.invalid_opponent")
		return

	if opponent == a.user.identity.id:
		a.error_label(400, "errors.cannot_play_against_yourself")
		return

	# Verify opponent is a friend
	friend = mochi.service.call("friends", "get", a.user.identity.id, opponent)
	if not friend:
		a.error_label(400, "errors.can_only_play_with_friends")
		return

	opponent_name = friend["name"]

	# Randomly assign white
	coin = mochi.random.alphanumeric(1)
	if coin < "s":
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
		a.error_label(400, "errors.invalid_message")
		return
	if len(body) > 10000:
		a.error_label(400, "errors.message_too_long")
		return
	if not body.strip():
		a.error_label(400, "errors.message_cannot_be_empty")
		return

	id = mochi.uid()
	now = mochi.time.now()
	mochi.db.execute("insert into messages ( id, game, member, name, body, type, created ) values ( ?, ?, ?, ?, ?, 'message', ? )", id, game["id"], a.user.identity.id, a.user.identity.name, body, now)

	mochi.websocket.write(game["key"], {"type": "message", "created": now, "member": a.user.identity.id, "name": a.user.identity.name, "body": body})

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
		a.error_label(400, "errors.game_is_not_active")
		return

	# Validate turn
	turn = "w" if " w " in game["fen"] else "b"
	player_color = "w" if game["white"] == a.user.identity.id else "b"
	if turn != player_color:
		a.error_label(400, "errors.not_your_turn")
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
		a.error_label(400, "errors.missing_move_data")
		return
	if not valid_square(move_from) or not valid_square(move_to):
		a.error_label(400, "errors.invalid_square")
		return
	if promotion and promotion not in ("q", "r", "b", "n"):
		a.error_label(400, "errors.invalid_promotion")
		return

	if len(san) > 10:
		a.error_label(400, "errors.invalid_move_notation")
		return
	if not valid_fen(fen):
		a.error_label(400, "errors.invalid_board_state")
		return
	if pgn and len(pgn) > 10000:
		a.error_label(400, "errors.pgn_too_long")
		return

	# Validate status and winner
	valid_statuses = ["active", "checkmate", "stalemate", "draw"]
	new_status = status if status in valid_statuses else "active"
	black = game["opponent"] if game["white"] == game["identity"] else game["identity"]
	players = [game["white"], black]
	new_winner = winner if winner in players else None

	now = mochi.time.now()
	mochi.db.execute(
		"update games set fen=?, pgn=?, status=?, winner=?, draw_offer=null, updated=? where id=?",
		fen, pgn or "", new_status, new_winner, now, game["id"]
	)

	# Insert move message
	id = mochi.uid()
	mochi.db.execute("insert into messages ( id, game, member, name, body, type, created ) values ( ?, ?, ?, ?, ?, 'move', ? )", id, game["id"], a.user.identity.id, a.user.identity.name, san, now)

	mochi.websocket.write(game["key"], {
		"type": "move", "created": now, "member": a.user.identity.id, "name": a.user.identity.name,
		"body": san, "from": move_from, "to": move_to, "promotion": promotion,
		"fen": fen, "pgn": pgn or "", "status": new_status, "winner": new_winner or "",
		"draw_offer": ""
	})

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
		a.error_label(400, "errors.game_is_not_active")
		return

	# Winner is the opponent
	other = get_opponent(game, a.user.identity.id)
	winner = other

	now = mochi.time.now()
	mochi.db.execute("update games set status='resigned', winner=?, updated=? where id=?", winner, now, game["id"])

	# Insert system message
	id = mochi.uid()
	msg = a.user.identity.name + " resigned"
	mochi.db.execute("insert into messages ( id, game, member, name, body, type, created ) values ( ?, ?, ?, ?, ?, 'system', ? )", id, game["id"], a.user.identity.id, a.user.identity.name, msg, now)

	mochi.websocket.write(game["key"], {"type": "system", "event": "resign", "created": now, "body": msg, "winner": winner})

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
		a.error_label(400, "errors.game_is_not_active")
		return

	if game["draw_offer"] == a.user.identity.id:
		a.error_label(400, "errors.you_already_offered_a_draw")
		return

	other = get_opponent(game, a.user.identity.id)

	now = mochi.time.now()
	mochi.db.execute("update games set draw_offer=?, updated=? where id=?", a.user.identity.id, now, game["id"])

	# Insert system message
	id = mochi.uid()
	msg = a.user.identity.name + " offered a draw"
	mochi.db.execute("insert into messages ( id, game, member, name, body, type, created ) values ( ?, ?, ?, ?, ?, 'system', ? )", id, game["id"], a.user.identity.id, a.user.identity.name, msg, now)

	mochi.websocket.write(game["key"], {"type": "system", "event": "draw_offer", "created": now, "body": msg, "draw_offer": a.user.identity.id})

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
		a.error_label(400, "errors.game_is_not_active")
		return

	if not game["draw_offer"] or game["draw_offer"] == a.user.identity.id:
		a.error_label(400, "errors.no_draw_offer_to_accept")
		return

	other = get_opponent(game, a.user.identity.id)

	now = mochi.time.now()
	mochi.db.execute("update games set status='draw', draw_offer=null, updated=? where id=?", now, game["id"])

	# Insert system message
	id = mochi.uid()
	msg = "Draw agreed"
	mochi.db.execute("insert into messages ( id, game, member, name, body, type, created ) values ( ?, ?, ?, ?, ?, 'system', ? )", id, game["id"], a.user.identity.id, a.user.identity.name, msg, now)

	mochi.websocket.write(game["key"], {"type": "system", "event": "draw_accept", "created": now, "body": msg})

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
		a.error_label(400, "errors.game_is_not_active")
		return

	if not game["draw_offer"] or game["draw_offer"] == a.user.identity.id:
		a.error_label(400, "errors.no_draw_offer_to_decline")
		return

	other = get_opponent(game, a.user.identity.id)

	now = mochi.time.now()
	mochi.db.execute("update games set draw_offer=null, updated=? where id=?", now, game["id"])

	# Insert system message
	id = mochi.uid()
	msg = a.user.identity.name + " declined the draw"
	mochi.db.execute("insert into messages ( id, game, member, name, body, type, created ) values ( ?, ?, ?, ?, ?, 'system', ? )", id, game["id"], a.user.identity.id, a.user.identity.name, msg, now)

	mochi.websocket.write(game["key"], {"type": "system", "event": "draw_decline", "created": now, "body": msg, "draw_offer": ""})

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
		a.error_label(400, "errors.cannot_delete_an_active_game")
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

	notify("activity", "", "Chess game", identity_name + " started a game", "/chess/" + game_id)

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

	mochi.db.execute("insert or ignore into messages ( id, game, member, name, body, type, created ) values ( ?, ?, ?, ?, ?, 'move', ? )", id, game["id"], sender, name, san, created)

	mochi.websocket.write(game["key"], {
		"type": "move", "created": created, "member": sender, "name": name,
		"body": san, "from": e.content("from") or "", "to": e.content("to") or "",
		"fen": fen, "pgn": pgn, "status": status, "winner": winner or "",
		"draw_offer": ""
	})
	notify("activity", "", "Chess move", name + " played " + san, "/chess/" + game["id"])

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

	mochi.db.execute("insert or ignore into messages ( id, game, member, name, body, type, created ) values ( ?, ?, ?, ?, ?, 'message', ? )", id, game["id"], sender, name, body, created)

	mochi.websocket.write(game["key"], {"type": "message", "created": created, "member": sender, "name": name, "body": body})
	notify("message", "", "Chess message", name + ": " + body, "/chess/" + game["id"])

# Received a resign event
def event_resign(e):
	game = mochi.db.row("select * from games where id=?", e.content("game"))
	if not game:
		return

	sender = e.header("from")
	if sender != game["identity"] and sender != game["opponent"]:
		return

	winner = e.content("winner")
	body = e.content("body") or "Opponent resigned"

	# Derive winner: the other player (not the one who resigned)
	players = [game["identity"], game["opponent"]]
	if winner not in players:
		winner = game["opponent"] if sender == game["identity"] else game["identity"]

	now = mochi.time.now()
	mochi.db.execute("update games set status='resigned', winner=?, updated=? where id=?", winner, now, game["id"])

	id = mochi.uid()
	mochi.db.execute("insert into messages ( id, game, member, name, body, type, created ) values ( ?, ?, ?, ?, ?, 'system', ? )", id, game["id"], sender, "", body, now)

	mochi.websocket.write(game["key"], {"type": "system", "event": "resign", "created": now, "body": body, "winner": winner or ""})
	notify("activity", "", "Chess game", body, "/chess/" + game["id"])

# Received a draw offer event
def event_draw_offer(e):
	game = mochi.db.row("select * from games where id=?", e.content("game"))
	if not game:
		return

	sender = e.header("from")
	if sender != game["identity"] and sender != game["opponent"]:
		return

	body = e.content("body") or "Draw offered"

	now = mochi.time.now()
	mochi.db.execute("update games set draw_offer=?, updated=? where id=?", sender, now, game["id"])

	id = mochi.uid()
	mochi.db.execute("insert into messages ( id, game, member, name, body, type, created ) values ( ?, ?, ?, ?, ?, 'system', ? )", id, game["id"], sender, "", body, now)

	mochi.websocket.write(game["key"], {"type": "system", "event": "draw_offer", "created": now, "body": body, "draw_offer": sender})
	notify("activity", "", "Chess", body, "/chess/" + game["id"])

# Received a draw accept event
def event_draw_accept(e):
	game = mochi.db.row("select * from games where id=?", e.content("game"))
	if not game:
		return

	sender = e.header("from")
	if sender != game["identity"] and sender != game["opponent"]:
		return

	body = e.content("body") or "Draw agreed"

	now = mochi.time.now()
	mochi.db.execute("update games set status='draw', draw_offer=null, updated=? where id=?", now, game["id"])

	id = mochi.uid()
	mochi.db.execute("insert into messages ( id, game, member, name, body, type, created ) values ( ?, ?, ?, ?, ?, 'system', ? )", id, game["id"], sender, "", body, now)

	mochi.websocket.write(game["key"], {"type": "system", "event": "draw_accept", "created": now, "body": body})
	notify("activity", "", "Chess", body, "/chess/" + game["id"])

# Received a draw decline event
def event_draw_decline(e):
	game = mochi.db.row("select * from games where id=?", e.content("game"))
	if not game:
		return

	sender = e.header("from")
	if sender != game["identity"] and sender != game["opponent"]:
		return

	body = e.content("body") or "Draw declined"

	now = mochi.time.now()
	mochi.db.execute("update games set draw_offer=null, updated=? where id=?", now, game["id"])

	id = mochi.uid()
	mochi.db.execute("insert into messages ( id, game, member, name, body, type, created ) values ( ?, ?, ?, ?, ?, 'system', ? )", id, game["id"], sender, "", body, now)

	mochi.websocket.write(game["key"], {"type": "system", "event": "draw_decline", "created": now, "body": body, "draw_offer": ""})
	notify("activity", "", "Chess", body, "/chess/" + game["id"])

