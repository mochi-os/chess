// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import {
  CAPTURED_PIECE_ORDER,
  type CapturedPieceType,
} from './chess-pieces'

export interface CapturedPieceCount {
  type: CapturedPieceType
  count: number
}

export interface CapturedPiecesSummary {
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

// Derives captures by counting the pieces still on the board, straight from
// the position itself. The previous version replayed SAN from the message
// history, which the protocol explicitly treats as an activity feed rather
// than a state ledger - it can diverge from the board, and the replay then
// silently showed nothing. Counting the FEN is always available and never
// divergent; its one imprecision is promotion, where a promoted piece makes
// the pawn look captured and offsets its own kind, which is the standard
// limit of deriving captures from a position alone.
export function getCapturedPiecesSummary(fen: string): CapturedPiecesSummary {
  const board = fen.split(' ')[0] ?? ''
  const white: Record<CapturedPieceType, number> = { ...STARTING_COUNTS }
  const black: Record<CapturedPieceType, number> = { ...STARTING_COUNTS }
  for (const ch of board) {
    const lower = ch.toLowerCase() as CapturedPieceType
    if (!CAPTURED_PIECE_ORDER.includes(lower)) continue
    const present = ch === lower ? black : white
    if (present[lower] > 0) present[lower] -= 1
  }
  return {
    // Pieces missing from black's side were captured by white, and vice versa.
    capturedByWhite: toCapturedPieceList(black),
    capturedByBlack: toCapturedPieceList(white),
  }
}
