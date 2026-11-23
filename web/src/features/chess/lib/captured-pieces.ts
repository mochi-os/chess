// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { DEFAULT_POSITION } from 'chess.js'
import { resume } from '@/lib/pgn'
import { CAPTURED_PIECE_ORDER, type CapturedPieceType } from './chess-pieces'

export interface CapturedPieceCount {
  type: CapturedPieceType
  count: number
}

interface CapturedPiecesSummary {
  capturedByWhite: CapturedPieceCount[]
  capturedByBlack: CapturedPieceCount[]
}

const STARTING_COUNTS: Record<CapturedPieceType, number> = {
  p: 8,
  n: 2,
  b: 2,
  r: 2,
  q: 1,
}

function toCapturedPieceList(
  counts: Record<CapturedPieceType, number>
): CapturedPieceCount[] {
  return CAPTURED_PIECE_ORDER.flatMap((type) =>
    counts[type] > 0 ? [{ type, count: counts[type] }] : []
  )
}

function isCapturedPieceType(type: string): type is CapturedPieceType {
  return (CAPTURED_PIECE_ORDER as readonly string[]).includes(type)
}

// What each side is missing from its starting set in a position. A piece above
// its starting count is a promoted pawn, so it is counted back as that pawn
// rather than as a pawn taken.
function missing(fen: string): {
  white: Record<CapturedPieceType, number>
  black: Record<CapturedPieceType, number>
} {
  const board = fen.split(' ')[0] ?? ''
  const present = {
    white: { p: 0, n: 0, b: 0, r: 0, q: 0 },
    black: { p: 0, n: 0, b: 0, r: 0, q: 0 },
  }
  for (const ch of board) {
    const lower = ch.toLowerCase()
    if (!isCapturedPieceType(lower)) continue
    present[ch === lower ? 'black' : 'white'][lower] += 1
  }
  const side = (have: Record<CapturedPieceType, number>) => {
    let promoted = 0
    const gone = { p: 0, n: 0, b: 0, r: 0, q: 0 }
    for (const type of CAPTURED_PIECE_ORDER) {
      if (type === 'p') continue
      promoted += Math.max(0, have[type] - STARTING_COUNTS[type])
      gone[type] = Math.max(0, STARTING_COUNTS[type] - have[type])
    }
    gone.p = Math.max(0, STARTING_COUNTS.p - have.p - promoted)
    return gone
  }
  return { white: side(present.white), black: side(present.black) }
}

// Captures are read from the game's record: the moves that took something, on
// top of whatever its starting position already lacked. Counting the position
// alone credits a promoted pawn as a capture. A record that does not replay to
// the position starts at the position, which then gives its count alone.
export function getCapturedPiecesSummary(
  fen: string,
  pgn: string
): CapturedPiecesSummary {
  let start = fen
  let moves: { color: string; captured?: string }[] = []
  try {
    const game = resume(fen, pgn)
    start = game.getHeaders()['FEN'] ?? DEFAULT_POSITION
    moves = game.history({ verbose: true })
  } catch {
    // A corrupt FEN: count what can be read of it.
  }
  const { white, black } = missing(start)
  for (const move of moves) {
    if (!move.captured || !isCapturedPieceType(move.captured)) continue
    // White taking a piece leaves Black without it, and the other way round.
    const loser = move.color === 'w' ? black : white
    loser[move.captured] += 1
  }
  return {
    // Pieces missing from black's side were captured by white, and vice versa.
    capturedByWhite: toCapturedPieceList(black),
    capturedByBlack: toCapturedPieceList(white),
  }
}
