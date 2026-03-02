import { useCallback, useMemo, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import { cn } from '@mochi/common'
import { PromotionDialog } from './promotion-dialog'

const PIECE_NAMES: Record<string, string> = {
  k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn',
}

function pieceImage(color: string, type: string): string {
  const side = color === 'w' ? 'white' : 'black'
  return `images/pieces/${side}/${PIECE_NAMES[type]}.svg`
}

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
  const [dragFrom, setDragFrom] = useState<string | null>(null)
  const [legalTargets, setLegalTargets] = useState<Set<string>>(new Set())
  const [promotionPending, setPromotionPending] = useState<{
    from: string
    to: string
  } | null>(null)

  const chess = useMemo(() => {
    const c = new Chess()
    c.load(fen)
    return c
  }, [fen])

  const board = chess.board()
  const isActive = gameStatus === 'active'
  const inCheck = chess.isCheck()
  const kingInCheckSquare = useMemo(() => {
    if (!inCheck) return null
    // Find the king that's in check
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const piece = board[r][f]
        if (piece && piece.type === 'k' && piece.color === chess.turn()) {
          return piece.square
        }
      }
    }
    return null
  }, [board, chess, inCheck])

  // Orient board based on player color
  const ranks = myColor === 'w' ? RANKS : [...RANKS].reverse()
  const files = myColor === 'w' ? FILES : [...FILES].reverse()

  const handleDragStart = useCallback(
    (e: React.DragEvent, square: string) => {
      if (!isActive || !isMyTurn) return
      const piece = chess.get(square as Square)
      if (!piece || piece.color !== myColor) {
        e.preventDefault()
        return
      }
      e.dataTransfer.setData('text/plain', square)
      e.dataTransfer.effectAllowed = 'move'
      setDragFrom(square)

      const moves = chess.moves({ square: square as Square, verbose: true })
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
      const piece = chess.get(fromSquare as Square)
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
          const piece = chess.get(dragFrom as Square)
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
        setDragFrom(null)
        setLegalTargets(new Set())
        return
      }

      const piece = chess.get(square as Square)
      if (piece && piece.color === myColor) {
        setDragFrom(square)
        const moves = chess.moves({ square: square as Square, verbose: true })
        setLegalTargets(new Set(moves.map((m) => m.to)))
      }
    },
    [chess, dragFrom, isActive, isMyTurn, legalTargets, myColor, onMove]
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
      style={{ maxWidth: 'min(100%, calc(100dvh - 108px))' }}
    >
      <div
        className="chess-board grid aspect-square w-full border border-border rounded overflow-hidden"
        style={{
          gridTemplateColumns: 'repeat(8, 1fr)',
          gridTemplateRows: 'repeat(8, 1fr)',
        }}
      >
        {ranks.map((rank, ri) =>
          files.map((file, fi) => {
            const square = `${file}${rank}`
            const piece = chess.get(square as Square)
            const isLight = (ri + fi) % 2 === 0
            const isDragSource = dragFrom === square
            const isLegalTarget = legalTargets.has(square)
            const isLastMoveSquare =
              lastMove?.from === square || lastMove?.to === square
            const isCheckSquare = kingInCheckSquare === square
            const hasPiece = !!piece
            const canDrag =
              isActive && isMyTurn && hasPiece && piece.color === myColor

            return (
              <div
                key={square}
                className={cn(
                  'chess-square relative flex items-center justify-center',
                  isLight
                    ? 'bg-[#f0dab5] dark:bg-[#b89a78]'
                    : 'bg-[#a3664e] dark:bg-[#7a4a38]',
                  isDragSource && 'opacity-40',
                  isLastMoveSquare && 'ring-2 ring-inset ring-yellow-400/60',
                  isCheckSquare && 'bg-red-400 dark:bg-red-600'
                )}
                onDragOver={(e) => handleDragOver(e, square)}
                onDrop={(e) => handleDrop(e, square)}
                onClick={() => handleSquareClick(square)}
              >
                {hasPiece && (
                  <img
                    src={pieceImage(piece.color, piece.type)}
                    alt={`${piece.color === 'w' ? 'White' : 'Black'} ${PIECE_NAMES[piece.type]}`}
                    className={cn(
                      'chess-piece select-none w-[80%] h-[80%]',
                      canDrag && 'cursor-grab active:cursor-grabbing'
                    )}
                    draggable={canDrag}
                    onDragStart={(e) => handleDragStart(e, square)}
                    onDragEnd={handleDragEnd}
                  />
                )}

                {/* Legal move indicator */}
                {isLegalTarget && !hasPiece && (
                  <div className="legal-target absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-[30%] h-[30%] rounded-full bg-black/20 dark:bg-white/20" />
                  </div>
                )}
                {isLegalTarget && hasPiece && (
                  <div className="legal-capture absolute inset-0 rounded-full ring-[3px] ring-inset ring-black/20 dark:ring-white/20 pointer-events-none" />
                )}

                {/* Coordinate labels */}
                {fi === 0 && (
                  <span className={cn(
                    'absolute top-0.5 left-0.5 text-[9px] leading-none font-medium',
                    isLight ? 'text-[#a3664e]/60 dark:text-[#7a4a38]/60' : 'text-[#f0dab5]/60 dark:text-[#b89a78]/60'
                  )}>
                    {rank}
                  </span>
                )}
                {ri === 7 && (
                  <span className={cn(
                    'absolute bottom-0.5 right-0.5 text-[9px] leading-none font-medium',
                    isLight ? 'text-[#a3664e]/60 dark:text-[#7a4a38]/60' : 'text-[#f0dab5]/60 dark:text-[#b89a78]/60'
                  )}>
                    {file}
                  </span>
                )}
              </div>
            )
          })
        )}
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
