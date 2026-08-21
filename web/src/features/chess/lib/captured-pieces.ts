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

// Count captures from the position itself, never by replaying message history
// (an activity feed that can diverge from the board). The one imprecision is
// promotion, where a promoted piece reads as a capture of its kind.
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
