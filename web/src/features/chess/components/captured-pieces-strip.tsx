import {
  getPieceImagePath,
  type CapturedPieceType,
} from '../lib/chess-pieces'
import { type CapturedPieceCount } from '../lib/captured-pieces'

interface CapturedPiecesStripProps {
  capturedByColor: 'w' | 'b'
  pieces: CapturedPieceCount[]
}

const COLOR_NAMES: Record<'w' | 'b', string> = {
  w: 'White',
  b: 'Black',
}

function getPieceLabel(type: CapturedPieceType, count: number): string {
  const names: Record<CapturedPieceType, string> = {
    p: 'pawn',
    n: 'knight',
    b: 'bishop',
    r: 'rook',
    q: 'queen',
  }

  const pieceName = names[type]
  return count === 1 ? pieceName : `${count} ${pieceName}s`
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
          <img
            key={`${pieceType}-${index}`}
            src={getPieceImagePath(capturedPieceColor, pieceType)}
            alt=""
            aria-hidden="true"
            className="absolute top-0 size-3.5"
            style={{
              left: index * overlap,
              zIndex: index + 1,
            }}
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
  const capturedPieceColor = capturedByColor === 'w' ? 'b' : 'w'
  const ariaLabel =
    pieces.length === 0
      ? `${COLOR_NAMES[capturedByColor]} has not captured any pieces`
      : `${COLOR_NAMES[capturedByColor]} captured ${pieces
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
