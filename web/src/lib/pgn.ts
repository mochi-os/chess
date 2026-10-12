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

/**
 * The squares of the last move played, or null when the record has none.
 *
 * Read from the record rather than remembered from the player's own click: a
 * remembered move is only ever this player's, so the opponent's was never
 * marked, and it had to be cleared on every position change, which the
 * player's own move also is.
 *
 * A record that does not replay to this position gives null, as in resume():
 * marking a move from some other game's history is worse than marking none.
 */
export function lastMove(
  fen: string,
  pgn: string
): { from: string; to: string } | null {
  try {
    const moves = resume(fen, pgn).history({ verbose: true })
    const last = moves[moves.length - 1]
    return last ? { from: last.from, to: last.to } : null
  } catch {
    // A corrupt FEN. The view already renders its own fallback for that.
    return null
  }
}
