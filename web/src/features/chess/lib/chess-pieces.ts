// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

export const CAPTURED_PIECE_ORDER = ['p', 'n', 'b', 'r', 'q'] as const

export type CapturedPieceType = typeof CAPTURED_PIECE_ORDER[number]
// Piece names are localised in useChessPieceName; the old English-name map
// this type keyed off is gone.
export type ChessPieceType = CapturedPieceType | 'k'
