// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useCallback, useMemo, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import { useLingui } from '@lingui/react/macro'
import { cn } from '@mochi/web'
import { CapturedPiecesStrip } from './captured-pieces-strip'
import { ChessPieceIcon } from './chess-piece-icon'
import { getCapturedPiecesSummary } from '../lib/captured-pieces'
import { useChessPieceName } from '../lib/use-chess-piece-name'
import { PromotionDialog } from './promotion-dialog'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1']

interface ChessBoardProps {
  fen: string
  myColor: 'w' | 'b'
  isMyTurn: boolean
  gameStatus: string
  onMove: (from: string, to: string, promotion?: string) => void
  lastMove?: { from: string; to: string } | null
}

export function ChessBoard({
  fen,
  myColor,
  isMyTurn,
  gameStatus,
  onMove,
  lastMove,
}: ChessBoardProps) {
  const { t } = useLingui()
  const pieceName = useChessPieceName()
  const [dragFrom, setDragFrom] = useState<string | null>(null)
  const [legalTargets, setLegalTargets] = useState<Set<string>>(new Set())
  const [promotionPending, setPromotionPending] = useState<{
    from: string
    to: string
  } | null>(null)
  const [keyboardPos, setKeyboardPos] = useState<[number, number] | null>(null)
  const [isBoardFocused, setIsBoardFocused] = useState(false)

  // Guarded like the parent's identical call: an unguarded throw here
  // crash-looped the view. null renders the fallback below.
  const chess = useMemo(() => {
    try {
      const c = new Chess()
      c.load(fen)
      return c
    } catch {
      return null
    }
  }, [fen])

  const board = chess?.board() ?? []
  const isActive = gameStatus === 'active'
  const inCheck = chess?.isCheck() ?? false
  const capturedPiecesSummary = useMemo(
    () => getCapturedPiecesSummary(fen),
    [fen]
  )
  const kingInCheckSquare = useMemo(() => {
    if (!inCheck) return null
    // Find the king that's in check
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const piece = board[r][f]
        if (piece && piece.type === 'k' && piece.color === chess?.turn()) {
          return piece.square
        }
      }
    }
    return null
  }, [board, chess, inCheck])

  // Orient board based on player color
  const ranks = myColor === 'w' ? RANKS : [...RANKS].reverse()
  const files = myColor === 'w' ? FILES : [...FILES].reverse()
  const topColor = myColor === 'w' ? 'b' : 'w'
  const topCapturedPieces =
    topColor === 'w'
      ? capturedPiecesSummary.capturedByWhite
      : capturedPiecesSummary.capturedByBlack
  const bottomCapturedPieces =
    myColor === 'w'
      ? capturedPiecesSummary.capturedByWhite
      : capturedPiecesSummary.capturedByBlack

  const handleDragStart = useCallback(
    (e: React.DragEvent, square: string) => {
      if (!isActive || !isMyTurn) return
      const piece = chess?.get(square as Square)
      if (!piece || piece.color !== myColor) {
        e.preventDefault()
        return
      }
      e.dataTransfer.setData('text/plain', square)
      e.dataTransfer.effectAllowed = 'move'
      setDragFrom(square)

      const moves = chess?.moves({ square: square as Square, verbose: true }) ?? []
      setLegalTargets(new Set(moves.map((m) => m.to)))
    },
    [chess, isActive, isMyTurn, myColor]
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent, square: string) => {
      if (legalTargets.has(square)) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
      }
    },
    [legalTargets]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent, toSquare: string) => {
      e.preventDefault()
      const fromSquare = e.dataTransfer.getData('text/plain')
      if (!fromSquare || !legalTargets.has(toSquare)) return

      // Check for pawn promotion
      const piece = chess?.get(fromSquare as Square)
      if (
        piece?.type === 'p' &&
        ((piece.color === 'w' && toSquare[1] === '8') ||
          (piece.color === 'b' && toSquare[1] === '1'))
      ) {
        setPromotionPending({ from: fromSquare, to: toSquare })
      } else {
        onMove(fromSquare, toSquare)
      }

      setDragFrom(null)
      setLegalTargets(new Set())
    },
    [chess, legalTargets, onMove]
  )

  const handleDragEnd = useCallback(() => {
    setDragFrom(null)
    setLegalTargets(new Set())
  }, [])

  const handleSquareClick = useCallback(
    (square: string) => {
      if (!isActive || !isMyTurn) return

      if (dragFrom) {
        if (legalTargets.has(square)) {
          const piece = chess?.get(dragFrom as Square)
          if (
            piece?.type === 'p' &&
            ((piece.color === 'w' && square[1] === '8') ||
              (piece.color === 'b' && square[1] === '1'))
          ) {
            setPromotionPending({ from: dragFrom, to: square })
          } else {
            onMove(dragFrom, square)
          }
        }
        // Fall through when the click was on another of our own pieces:
        // deselect-then-return made re-selecting take two clicks.
        const own = chess?.get(square as Square)
        if (!(own && own.color === myColor && square !== dragFrom)) {
          setDragFrom(null)
          setLegalTargets(new Set())
          return
        }
      }

      const piece = chess?.get(square as Square)
      if (piece && piece.color === myColor) {
        setDragFrom(square)
        const moves = chess?.moves({ square: square as Square, verbose: true }) ?? []
        setLegalTargets(new Set(moves.map((m) => m.to)))
      }
    },
    [chess, dragFrom, isActive, isMyTurn, legalTargets, myColor, onMove]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // Same seed onFocus uses, so the fallback is neither arbitrary nor
      // unreachable.
      const [kr, kc] = keyboardPos ?? (myColor === 'w' ? [6, 4] : [6, 3])

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault()
          setKeyboardPos([Math.max(0, kr - 1), kc])
          break
        case 'ArrowDown':
          e.preventDefault()
          setKeyboardPos([Math.min(7, kr + 1), kc])
          break
        case 'ArrowLeft':
          e.preventDefault()
          setKeyboardPos([kr, Math.max(0, kc - 1)])
          break
        case 'ArrowRight':
          e.preventDefault()
          setKeyboardPos([kr, Math.min(7, kc + 1)])
          break
        case 'Enter':
        case ' ':
          e.preventDefault()
          if (keyboardPos) {
            handleSquareClick(`${files[keyboardPos[1]]}${ranks[keyboardPos[0]]}`)
          }
          break
        case 'Escape':
          e.preventDefault()
          setDragFrom(null)
          setLegalTargets(new Set())
          break
        default:
          break
      }
    },
    [keyboardPos, files, ranks, handleSquareClick]
  )

  const handlePromotion = useCallback(
    (piece: string) => {
      if (promotionPending) {
        onMove(promotionPending.from, promotionPending.to, piece)
        setPromotionPending(null)
      }
    },
    [onMove, promotionPending]
  )

  return (
    <div
      className="mx-auto w-full"
      style={{ maxWidth: 'min(100cqw, 100cqh)' }}
    >
      {/* Mobile: opponent's captured pieces above the board */}
      <div className="sm:hidden mb-1">
        <CapturedPiecesStrip
          capturedByColor={topColor}
          pieces={topCapturedPieces}
        />
      </div>
      <div className="flex w-full items-stretch justify-center gap-3">
        {/* Desktop: side column with both strips flanking the board */}
        <div className="hidden sm:flex shrink-0 flex-col justify-between py-0.5">
          <CapturedPiecesStrip
            capturedByColor={topColor}
            pieces={topCapturedPieces}
          />
          <CapturedPiecesStrip
            capturedByColor={myColor}
            pieces={bottomCapturedPieces}
          />
        </div>
        <div
          className="chess-board grid aspect-square w-full border border-border rounded overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          style={{
            gridTemplateColumns: 'repeat(8, 1fr)',
            gridTemplateRows: 'repeat(8, 1fr)',
          }}
          tabIndex={0}
          role="application"
          aria-label={isActive && isMyTurn
            ? t`Chess board. Your turn. Use arrow keys to navigate, Enter or Space to select.`
            : t`Chess board. Use arrow keys to navigate, Enter or Space to select.`}
          onFocus={() => {
            setIsBoardFocused(true)
            if (!keyboardPos) setKeyboardPos(myColor === 'w' ? [6, 4] : [6, 3])
          }}
          onBlur={() => setIsBoardFocused(false)}
          onKeyDown={handleKeyDown}
        >
        {ranks.map((rank, ri) =>
          files.map((file, fi) => {
            const square = `${file}${rank}`
            const piece = chess?.get(square as Square)
            const isLight = (ri + fi) % 2 === 0
            const isDragSource = dragFrom === square
            const isLegalTarget = legalTargets.has(square)
            const isLastMoveSquare =
              lastMove?.from === square || lastMove?.to === square
            const isCheckSquare = kingInCheckSquare === square
            const hasPiece = !!piece
            const canDrag =
              isActive && isMyTurn && hasPiece && piece.color === myColor
            const isKeyboardFocus =
              isBoardFocused &&
              keyboardPos !== null &&
              keyboardPos[0] === ri &&
              keyboardPos[1] === fi

            return (
              <div
                key={square}
                className={cn(
                  'chess-square relative flex items-center justify-center',
                  isLight
                    ? 'bg-[var(--chess-sq-light)]'
                    : 'bg-[var(--chess-sq-dark)]',
                  isDragSource && 'opacity-40',
                  isLastMoveSquare && 'ring-2 ring-inset ring-yellow-400/60',
                  isCheckSquare && 'bg-red-400 dark:bg-red-600'
                )}
                onDragOver={(e) => handleDragOver(e, square)}
                onDrop={(e) => handleDrop(e, square)}
                onClick={() => handleSquareClick(square)}
              >
                {hasPiece && (
                  <ChessPieceIcon
                    aria-label={piece.color === 'w' ? t`White ${pieceName(piece.type)}` : t`Black ${pieceName(piece.type)}`}
                    color={piece.color}
                    className={cn(
                      'chess-piece select-none size-[80%] sm:size-[74%] lg:size-[72%]',
                      canDrag && 'cursor-grab active:cursor-grabbing'
                    )}
                    type={piece.type}
                    draggable={canDrag}
                    onDragStart={(e) => handleDragStart(e, square)}
                    onDragEnd={handleDragEnd}
                  />
                )}

                {/* Legal move indicator */}
                {isLegalTarget && !hasPiece && (
                  <div className="legal-target absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-[30%] h-[30%] rounded-full bg-emerald-500/30" />
                  </div>
                )}
                {isLegalTarget && hasPiece && (
                  <div className="legal-capture absolute inset-0 rounded-full ring-[3px] ring-inset ring-emerald-500/40 pointer-events-none" />
                )}

                {/* Coordinate labels */}
                {fi === 0 && (
                  <span className={cn(
                    'absolute top-0.5 left-0.5 text-[9px] leading-none font-medium',
                    isLight ? 'text-[var(--chess-sq-dark)]/60' : 'text-[var(--chess-sq-light)]/60'
                  )}>
                    {rank}
                  </span>
                )}
                {ri === 7 && (
                  <span className={cn(
                    'absolute bottom-0.5 right-0.5 text-[9px] leading-none font-medium',
                    isLight ? 'text-[var(--chess-sq-dark)]/60' : 'text-[var(--chess-sq-light)]/60'
                  )}>
                    {file}
                  </span>
                )}

                {/* Keyboard navigation cursor */}
                {isKeyboardFocus && (
                  <div
                    className="absolute inset-0 ring-2 ring-primary ring-inset pointer-events-none z-10"
                    aria-hidden="true"
                  />
                )}
              </div>
            )
          })
        )}
        </div>
      </div>

      {/* Mobile: my captured pieces below the board */}
      <div className="sm:hidden mt-1">
        <CapturedPiecesStrip
          capturedByColor={myColor}
          pieces={bottomCapturedPieces}
        />
      </div>

      {promotionPending && (
        <PromotionDialog
          color={myColor}
          onSelect={handlePromotion}
          onCancel={() => setPromotionPending(null)}
        />
      )}
    </div>
  )
}
