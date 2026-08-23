// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { Chess } from 'chess.js'

/**
 * A Chess instance carrying the game's history, ready for the next move.
 *
 * The server stores two views of a game: `pgn` is the score, `fen` the current
 * position. Loading only the FEN gives an instance with an EMPTY history, so
 * the `pgn()` of the result is one move long and replaces the record rather
 * than extending it. Replaying the PGN instead keeps the score whole.
 *
 * The two are only trusted together. A PGN that does not replay to this exact
 * position is not this game's history - a truncated record from before this was
 * fixed, or a client that wrote something else - and replaying it would validate
 * the move against the wrong board. Those fall back to the position alone, which
 * costs that game its (already lost) history but keeps it playable.
 */
export function resume(fen: string, pgn: string): Chess {
  if (pgn) {
    try {
      const replayed = new Chess()
      replayed.loadPgn(pgn)
      if (replayed.fen() === fen) {
        return replayed
      }
    } catch {
      // Malformed or truncated: fall through to the position.
    }
  }
  // chess.js v1 throws on a corrupt FEN; the caller already handles that.
  const positioned = new Chess()
  positioned.load(fen)
  return positioned
}
