import { cn } from '@mochi/web'

const PIECE_NAMES: Record<string, string> = {
  q: 'queen', r: 'rook', b: 'bishop', n: 'knight',
}

const PROMOTION_PIECES = ['q', 'r', 'b', 'n'] as const

function pieceImage(color: string, type: string): string {
  const side = color === 'w' ? 'white' : 'black'
  return `images/pieces/${side}/${PIECE_NAMES[type]}.svg`
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
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
      <div className="bg-card rounded-lg border shadow-lg p-3">
        <p className="text-sm font-medium text-center mb-2">Promote to:</p>
        <div className="flex gap-1">
          {PROMOTION_PIECES.map((piece) => (
            <button
              key={piece}
              type="button"
              onClick={() => onSelect(piece)}
              className={cn(
                'flex items-center justify-center w-14 h-14 rounded-lg',
                'hover:bg-accent transition-colors',
                'border border-border'
              )}
            >
              <img
                src={pieceImage(color, piece)}
                alt={PIECE_NAMES[piece]}
                className="w-10 h-10"
              />
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
