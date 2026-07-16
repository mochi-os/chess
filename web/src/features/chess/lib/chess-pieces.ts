// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

export const CHESS_PIECE_NAMES = {
  k: 'king',
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
} as const

export const CAPTURED_PIECE_ORDER = ['p', 'n', 'b', 'r', 'q'] as const

export type ChessPieceType = keyof typeof CHESS_PIECE_NAMES
export type CapturedPieceType = typeof CAPTURED_PIECE_ORDER[number]
