// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useLingui } from '@lingui/react/macro'
import type { ChessPieceType } from './chess-pieces'

/**
 * Translated chess piece name lookup. Keys (`k`, `q`, etc.) stay constant
 * so they can be compared and stored; only the display label is i18n'd.
 */
export function useChessPieceName() {
  const { t } = useLingui()
  return (type: ChessPieceType): string => {
    switch (type) {
      case 'k': return t`king`
      case 'q': return t`queen`
      case 'r': return t`rook`
      case 'b': return t`bishop`
      case 'n': return t`knight`
      case 'p': return t`pawn`
    }
  }
}
