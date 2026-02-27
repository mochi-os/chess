import { cn } from '@mochi/common'

const PROMOTION_PIECES = {
  w: [
    { piece: 'q', symbol: '\u2655' },
    { piece: 'r', symbol: '\u2656' },
    { piece: 'b', symbol: '\u2657' },
    { piece: 'n', symbol: '\u2658' },
  ],
  b: [
    { piece: 'q', symbol: '\u265B' },
    { piece: 'r', symbol: '\u265C' },
    { piece: 'b', symbol: '\u265D' },
    { piece: 'n', symbol: '\u265E' },
  ],
}

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
  const pieces = PROMOTION_PIECES[color]

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
      <div className="bg-card rounded-lg border shadow-lg p-3">
        <p className="text-sm font-medium text-center mb-2">Promote to:</p>
        <div className="flex gap-1">
          {pieces.map(({ piece, symbol }) => (
            <button
              key={piece}
              type="button"
              onClick={() => onSelect(piece)}
              className={cn(
                'flex items-center justify-center w-14 h-14 rounded-lg',
                'text-4xl hover:bg-accent transition-colors',
                'border border-border'
              )}
            >
              {symbol}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="mt-2 w-full text-xs text-muted-foreground hover:text-foreground text-center"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
