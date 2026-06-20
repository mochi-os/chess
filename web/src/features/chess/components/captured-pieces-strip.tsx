// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { ChessPieceIcon } from './chess-piece-icon'
import {
  type CapturedPieceType,
} from '../lib/chess-pieces'
import { type CapturedPieceCount } from '../lib/captured-pieces'

interface CapturedPiecesStripProps {
  capturedByColor: 'w' | 'b'
  pieces: CapturedPieceCount[]
}

function useColorName(color: 'w' | 'b'): string {
  const { t } = useLingui()
  return color === 'w' ? t`White` : t`Black`
}

function usePieceLabel() {
  const { t } = useLingui()
  return (type: CapturedPieceType, count: number): string => {
    switch (type) {
      case 'p':
        return plural(count, { one: '# pawn', other: '# pawns' })
      case 'n':
        return plural(count, { one: '# knight', other: '# knights' })
      case 'b':
        return plural(count, { one: '# bishop', other: '# bishops' })
      case 'r':
        return plural(count, { one: '# rook', other: '# rooks' })
      case 'q':
        return plural(count, { one: '# queen', other: '# queens' })
      default:
        return t`${count} pieces`
    }
  }
}

function CapturedPieceStack({
  capturedPieceColor,
  pieceType,
  count,
}: {
  capturedPieceColor: 'w' | 'b'
  pieceType: CapturedPieceType
  count: number
}) {
  const overlap = 4
  const width = 14 + Math.max(0, count - 1) * overlap

  return (
    <div className="h-4" style={{ width }}>
      <div className="relative h-full w-full">
        {Array.from({ length: count }).map((_, index) => (
          <ChessPieceIcon
            key={`${pieceType}-${index}`}
            aria-hidden="true"
            className="absolute top-0 size-3.5"
            color={capturedPieceColor}
            decorative
            style={{
              left: index * overlap,
              zIndex: index + 1,
            }}
            type={pieceType}
          />
        ))}
      </div>
    </div>
  )
}

export function CapturedPiecesStrip({
  capturedByColor,
  pieces,
}: CapturedPiecesStripProps) {
  const { t } = useLingui()
  const capturedPieceColor = capturedByColor === 'w' ? 'b' : 'w'
  const colorName = useColorName(capturedByColor)
  const getPieceLabel = usePieceLabel()
  const ariaLabel =
    pieces.length === 0
      ? t`${colorName} has not captured any pieces`
      : t`${colorName} captured ${pieces
        .map(({ type, count }) => getPieceLabel(type, count))
        .join(', ')}`

  return (
    <div
      aria-label={ariaLabel}
      className="flex min-h-11 w-full flex-col items-center justify-center rounded-2xl border border-border/60 bg-gradient-to-b from-background/95 to-muted/45 px-1.5 py-1.5 shadow-sm transition-colors duration-200 hover:border-border/90"
      role="group"
    >
      <div className="flex w-full items-center justify-center gap-1 overflow-x-auto [scrollbar-width:none] sm:flex-col sm:overflow-visible [&::-webkit-scrollbar]:hidden">
        {pieces.length === 0 ? (
          <span className="text-[9px] font-medium leading-none text-muted-foreground/70">
            --
          </span>
        ) : pieces.map(({ type, count }) => (
          <div
            key={type}
            className="flex w-auto items-center justify-center sm:w-full"
          >
            <CapturedPieceStack
              capturedPieceColor={capturedPieceColor}
              pieceType={type}
              count={count}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
