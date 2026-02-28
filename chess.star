# Mochi Chess app

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
	if to_version == 2:
		mochi.db.execute("alter table games add column draw_offer text")

# Get friends list for new game
def action_new(a):
	friends = mochi.service.call("friends", "list", a.user.identity.id) or []
	return {
		"data": {"friends": friends}
	}

# Create new game
def action_create(a):
	opponent = a.input("opponent")
	if not mochi.valid(opponent, "entity"):
		a.error(400, "Invalid opponent")
		return

	if opponent == a.user.identity.id:
		a.error(400, "Cannot play against yourself")
		return

	# Verify opponent is a friend
	friend = mochi.service.call("friends", "get", a.user.identity.id, opponent)
	if not friend:
		a.error(400, "Can only play with friends")
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
		SELECT * FROM games
		WHERE identity = ? OR opponent = ?
		ORDER BY updated DESC
	""", a.user.identity.id, a.user.identity.id)

	return {
		"data": games
	}

# View a game
def action_view(a):
	if not mochi.valid(a.input("game"), "id"):
		a.error(400, "Invalid game ID")
		return
	game = mochi.db.row("select * from games where id=?", a.input("game"))
	if not game:
		a.error(404, "Game not found")
		return

	# Verify user is a player
	if game["identity"] != a.user.identity.id and game["opponent"] != a.user.identity.id:
		a.error(403, "Not a player in this game")
		return

	mochi.service.call("notifications", "clear/object", "chess", game["id"])

	return {
		"data": {"game": game, "identity": a.user.identity.id}
	}

# Get messages for a game with cursor-based pagination
def action_messages(a):
	if not mochi.valid(a.input("game"), "id"):
		a.error(400, "Invalid game ID")
		return
	game = mochi.db.row("select * from games where id=?", a.input("game"))
	if not game:
		a.error(404, "Game not found")
		return

	# Verify user is a player
	if game["identity"] != a.user.identity.id and game["opponent"] != a.user.identity.id:
		a.error(403, "Not a player in this game")
		return

	# Pagination parameters
	limit = 30
	limit_str = a.input("limit")
	if limit_str and mochi.valid(limit_str, "natural"):
		limit = min(int(limit_str), 100)

	before = None
	before_str = a.input("before")
	if before_str and mochi.valid(before_str, "natural"):
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

	for m in messages:
		m["created_local"] = mochi.time.local(m["created"])

	return {
		"data": {
			"messages": messages,
			"hasMore": has_more,
			"nextCursor": next_cursor
		}
	}

# Send a chat message
def action_send(a):
	if not mochi.valid(a.input("game"), "id"):
		a.error(400, "Invalid game ID")
		return
	game = mochi.db.row("select * from games where id=?", a.input("game"))
	if not game:
		a.error(404, "Game not found")
		return

	# Verify user is a player
	if game["identity"] != a.user.identity.id and game["opponent"] != a.user.identity.id:
		a.error(403, "Not a player in this game")
		return

	body = a.input("body", "")
	if not mochi.valid(body, "text"):
		a.error(400, "Invalid message")
		return
	if len(body) > 10000:
		a.error(400, "Message too long")
		return
	if not body.strip():
		a.error(400, "Message cannot be empty")
		return

	id = mochi.uid()
	now = mochi.time.now()
	mochi.db.execute("insert into messages ( id, game, member, name, body, type, created ) values ( ?, ?, ?, ?, ?, 'message', ? )", id, game["id"], a.user.identity.id, a.user.identity.name, body, now)

	mochi.websocket.write(game["key"], {"type": "message", "created": now, "member": a.user.identity.id, "name": a.user.identity.name, "body": body})

	# Get opponent ID
	if game["identity"] == a.user.identity.id:
		other = game["opponent"]
	else:
		other = game["identity"]

	mochi.message.send(
		{"from": a.user.identity.id, "to": other, "service": "chess", "event": "message"},
		{"game": game["id"], "message": id, "created": now, "body": body, "name": a.user.identity.name}
	)

	return {
		"data": {"id": id}
	}

# Make a move
def action_move(a):
	if not mochi.valid(a.input("game"), "id"):
		a.error(400, "Invalid game ID")
		return
	game = mochi.db.row("select * from games where id=?", a.input("game"))
	if not game:
		a.error(404, "Game not found")
		return

	# Verify user is a player
	if game["identity"] != a.user.identity.id and game["opponent"] != a.user.identity.id:
		a.error(403, "Not a player in this game")
		return

	if game["status"] != "active":
		a.error(400, "Game is not active")
		return

	# Validate turn
	turn = "w" if " w " in game["fen"] else "b"
	player_color = "w" if game["white"] == a.user.identity.id else "b"
	if turn != player_color:
		a.error(400, "Not your turn")
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
		a.error(400, "Missing move data")
		return

	# Update game state
	new_status = status if status else "active"
	new_winner = winner if winner else None

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

	# Send to opponent
	if game["identity"] == a.user.identity.id:
		other = game["opponent"]
	else:
		other = game["identity"]

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
	if not mochi.valid(a.input("game"), "id"):
		a.error(400, "Invalid game ID")
		return
	game = mochi.db.row("select * from games where id=?", a.input("game"))
	if not game:
		a.error(404, "Game not found")
		return

	if game["identity"] != a.user.identity.id and game["opponent"] != a.user.identity.id:
		a.error(403, "Not a player in this game")
		return

	if game["status"] != "active":
		a.error(400, "Game is not active")
		return

	# Winner is the opponent
	if game["identity"] == a.user.identity.id:
		winner = game["opponent"]
		other = game["opponent"]
	else:
		winner = game["identity"]
		other = game["identity"]

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
	if not mochi.valid(a.input("game"), "id"):
		a.error(400, "Invalid game ID")
		return
	game = mochi.db.row("select * from games where id=?", a.input("game"))
	if not game:
		a.error(404, "Game not found")
		return

	if game["identity"] != a.user.identity.id and game["opponent"] != a.user.identity.id:
		a.error(403, "Not a player in this game")
		return

	if game["status"] != "active":
		a.error(400, "Game is not active")
		return

	if game["draw_offer"] == a.user.identity.id:
		a.error(400, "You already offered a draw")
		return

	# Get opponent ID
	if game["identity"] == a.user.identity.id:
		other = game["opponent"]
	else:
		other = game["identity"]

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
	if not mochi.valid(a.input("game"), "id"):
		a.error(400, "Invalid game ID")
		return
	game = mochi.db.row("select * from games where id=?", a.input("game"))
	if not game:
		a.error(404, "Game not found")
		return

	if game["identity"] != a.user.identity.id and game["opponent"] != a.user.identity.id:
		a.error(403, "Not a player in this game")
		return

	if game["status"] != "active":
		a.error(400, "Game is not active")
		return

	if not game["draw_offer"] or game["draw_offer"] == a.user.identity.id:
		a.error(400, "No draw offer to accept")
		return

	# Get opponent ID
	if game["identity"] == a.user.identity.id:
		other = game["opponent"]
	else:
		other = game["identity"]

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
	if not mochi.valid(a.input("game"), "id"):
		a.error(400, "Invalid game ID")
		return
	game = mochi.db.row("select * from games where id=?", a.input("game"))
	if not game:
		a.error(404, "Game not found")
		return

	if game["identity"] != a.user.identity.id and game["opponent"] != a.user.identity.id:
		a.error(403, "Not a player in this game")
		return

	if game["status"] != "active":
		a.error(400, "Game is not active")
		return

	if not game["draw_offer"] or game["draw_offer"] == a.user.identity.id:
		a.error(400, "No draw offer to decline")
		return

	# Get opponent ID
	if game["identity"] == a.user.identity.id:
		other = game["opponent"]
	else:
		other = game["identity"]

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
	if not mochi.valid(a.input("game"), "id"):
		a.error(400, "Invalid game ID")
		return
	game = mochi.db.row("select * from games where id=?", a.input("game"))
	if not game:
		a.error(404, "Game not found")
		return

	if game["identity"] != a.user.identity.id and game["opponent"] != a.user.identity.id:
		a.error(403, "Not a player in this game")
		return

	if game["status"] == "active":
		a.error(400, "Cannot delete an active game")
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
	if not mochi.valid(game_id, "id"):
		return

	identity = e.content("identity")
	if not mochi.valid(identity, "entity"):
		return

	identity_name = e.content("identity_name")
	if not mochi.valid(identity_name, "name"):
		return

	opponent = e.content("opponent")
	if not mochi.valid(opponent, "entity"):
		return

	opponent_name = e.content("opponent_name")
	if not mochi.valid(opponent_name, "name"):
		return

	white = e.content("white")
	if not mochi.valid(white, "entity"):
		return

	created = e.content("created")
	if not mochi.valid(str(created), "integer"):
		return

	result = mochi.db.execute(
		"insert or ignore into games ( id, identity, identity_name, opponent, opponent_name, white, key, updated, created ) values ( ?, ?, ?, ?, ?, ?, ?, ?, ? )",
		game_id, identity, identity_name, opponent, opponent_name, white, mochi.random.alphanumeric(16), mochi.time.now(), created
	)
	if result == 0:
		return

	mochi.service.call("notifications", "send", "new", "Chess game", identity_name + " started a game", game_id, "/chess/" + game_id)

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

	now = mochi.time.now()
	mochi.db.execute("update games set fen=?, pgn=?, status=?, winner=?, draw_offer=null, updated=? where id=?", fen, pgn, status, winner, now, game["id"])

	id = e.content("message")
	if not mochi.valid(str(id), "id"):
		id = mochi.uid()

	created = e.content("created")
	if not mochi.valid(str(created), "integer"):
		created = now

	name = e.content("name") or "Opponent"

	mochi.db.execute("insert or ignore into messages ( id, game, member, name, body, type, created ) values ( ?, ?, ?, ?, ?, 'move', ? )", id, game["id"], sender, name, san, created)

	mochi.websocket.write(game["key"], {
		"type": "move", "created": created, "member": sender, "name": name,
		"body": san, "from": e.content("from") or "", "to": e.content("to") or "",
		"fen": fen, "pgn": pgn, "status": status, "winner": winner or "",
		"draw_offer": ""
	})
	mochi.service.call("notifications", "send", "move", "Chess move", name + " played " + san, game["id"], "/chess/" + game["id"])

# Received a chat message event
def event_message(e):
	game = mochi.db.row("select * from games where id=?", e.content("game"))
	if not game:
		return

	sender = e.header("from")
	if sender != game["identity"] and sender != game["opponent"]:
		return

	id = e.content("message")
	if not mochi.valid(str(id), "id"):
		return

	created = e.content("created")
	if not mochi.valid(str(created), "integer"):
		return

	body = e.content("body")
	if not mochi.valid(str(body), "text"):
		return
	if len(str(body)) > 10000:
		return

	name = e.content("name") or "Opponent"

	mochi.db.execute("insert or ignore into messages ( id, game, member, name, body, type, created ) values ( ?, ?, ?, ?, ?, 'message', ? )", id, game["id"], sender, name, body, created)

	mochi.websocket.write(game["key"], {"type": "message", "created": created, "member": sender, "name": name, "body": body})
	mochi.service.call("notifications", "send", "message", "Chess message", name + ": " + body, game["id"], "/chess/" + game["id"])

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

	now = mochi.time.now()
	mochi.db.execute("update games set status='resigned', winner=?, updated=? where id=?", winner, now, game["id"])

	id = mochi.uid()
	mochi.db.execute("insert into messages ( id, game, member, name, body, type, created ) values ( ?, ?, ?, ?, ?, 'system', ? )", id, game["id"], sender, "", body, now)

	mochi.websocket.write(game["key"], {"type": "system", "event": "resign", "created": now, "body": body, "winner": winner or ""})
	mochi.service.call("notifications", "send", "resign", "Chess game", body, game["id"], "/chess/" + game["id"])

# Received a draw offer event
def event_draw_offer(e):
	game = mochi.db.row("select * from games where id=?", e.content("game"))
	if not game:
		return

	sender = e.header("from")
	if sender != game["identity"] and sender != game["opponent"]:
		return

	draw_offer = e.content("draw_offer")
	body = e.content("body") or "Draw offered"

	now = mochi.time.now()
	mochi.db.execute("update games set draw_offer=?, updated=? where id=?", draw_offer, now, game["id"])

	id = mochi.uid()
	mochi.db.execute("insert into messages ( id, game, member, name, body, type, created ) values ( ?, ?, ?, ?, ?, 'system', ? )", id, game["id"], sender, "", body, now)

	mochi.websocket.write(game["key"], {"type": "system", "event": "draw_offer", "created": now, "body": body, "draw_offer": draw_offer})
	mochi.service.call("notifications", "send", "draw_offer", "Chess", body, game["id"], "/chess/" + game["id"])

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
	mochi.service.call("notifications", "send", "draw_accept", "Chess", body, game["id"], "/chess/" + game["id"])

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
	mochi.service.call("notifications", "send", "draw_decline", "Chess", body, game["id"], "/chess/" + game["id"])

# Notification proxy actions

def action_notifications_subscribe(a):
	label = a.input("label", "").strip()
	type = a.input("type", "").strip()
	object = a.input("object", "").strip()
	destinations = a.input("destinations", "")

	if not label:
		a.error(400, "label is required")
		return
	if not mochi.valid(label, "text"):
		a.error(400, "Invalid label")
		return

	destinations_list = json.decode(destinations) if destinations else []

	result = mochi.service.call("notifications", "subscribe", label, type, object, destinations_list)
	return {"data": {"id": result}}

def action_notifications_check(a):
	result = mochi.service.call("notifications", "subscriptions")
	return {"data": {"exists": len(result) > 0}}

def action_notifications_destinations(a):
	result = mochi.service.call("notifications", "destinations")
	return {"data": result}
