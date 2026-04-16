import { useEffect, useId, useRef } from 'react'
import { cn } from '@mochi/web'
import { ChessPieceIcon } from './chess-piece-icon'
import { CHESS_PIECE_NAMES } from '../lib/chess-pieces'

const PROMOTION_PIECES = ['q', 'r', 'b', 'n'] as const
const PROMOTION_SHORTCUTS = ['1', '2', '3', '4'] as const

interface PromotionDialogProps {
  color: 'w' | 'b'
  onSelect: (piece: string) => void
  onCancel: () => void
}

export function PromotionDialog({
  color,
  onSelect,
  onCancel,
}: PromotionDialogProps) {
  const titleId = useId()
  const queenButtonRef = useRef<HTMLButtonElement | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null

    queenButtonRef.current?.focus({ preventScroll: true })

    return () => {
      if (previousFocusRef.current?.isConnected) {
        previousFocusRef.current.focus({ preventScroll: true })
      }
    }
  }, [])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
      return
    }

    const shortcutIndex = PROMOTION_SHORTCUTS.indexOf(
      event.key as (typeof PROMOTION_SHORTCUTS)[number]
    )

    if (shortcutIndex >= 0) {
      event.preventDefault()
      onSelect(PROMOTION_PIECES[shortcutIndex])
    }
  }

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="bg-card rounded-lg border shadow-lg p-3"
        onKeyDown={handleKeyDown}
        role="dialog"
      >
        <h2 className="text-sm font-medium text-center mb-2" id={titleId}>
          Promote to:
        </h2>
        <div className="flex gap-1">
          {PROMOTION_PIECES.map((piece, index) => (
            <button
              aria-label={`Promote to ${CHESS_PIECE_NAMES[piece]}`}
              aria-keyshortcuts={PROMOTION_SHORTCUTS[index]}
              key={piece}
              ref={piece === 'q' ? queenButtonRef : undefined}
              type="button"
              onClick={() => onSelect(piece)}
              className={cn(
                'flex items-center justify-center w-14 h-14 rounded-lg',
                'border border-border transition-colors hover:bg-accent',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-hidden'
              )}
            >
              <ChessPieceIcon
                color={color}
                className="size-10"
                type={piece}
              />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="mt-2 w-full text-xs text-muted-foreground hover:text-foreground text-center focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
