import { Button } from '@mochi/common'
import { Flag, Loader2 } from 'lucide-react'
import type { Game } from '@/api/games'

interface GameStatusProps {
  game: Game
  myColor: 'w' | 'b'
  isMyTurn: boolean
  isCheck: boolean
  onResign: () => void
  isResigning: boolean
  myIdentity: string
}

function getOpponentName(game: Game, myIdentity: string): string {
  return game.identity === myIdentity ? game.opponent_name : game.identity_name
}

export function GameStatus({
  game,
  myColor,
  isMyTurn,
  isCheck,
  onResign,
  isResigning,
  myIdentity,
}: GameStatusProps) {
  const opponentName = getOpponentName(game, myIdentity)
  const colorLabel = myColor === 'w' ? 'White' : 'Black'

  let statusText: string
  if (game.status === 'checkmate') {
    statusText = game.winner === myIdentity
      ? 'Checkmate — you win!'
      : `Checkmate — ${opponentName} wins`
  } else if (game.status === 'stalemate') {
    statusText = 'Stalemate — draw'
  } else if (game.status === 'draw') {
    statusText = 'Draw'
  } else if (game.status === 'resigned') {
    statusText = game.winner === myIdentity
      ? `${opponentName} resigned — you win!`
      : `You resigned — ${opponentName} wins`
  } else if (isCheck) {
    statusText = isMyTurn ? 'Check — your move' : `Check — ${opponentName}'s move`
  } else {
    statusText = isMyTurn ? 'Your move' : `${opponentName}'s move`
  }

  return (
    <div className="flex items-center justify-between gap-2 px-1 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-lg">{myColor === 'w' ? '\u2654' : '\u265A'}</span>
          <span className="text-sm text-muted-foreground">
            Playing as {colorLabel}
          </span>
        </div>
        <span className="text-muted-foreground">·</span>
        <span className="text-sm font-medium truncate">{statusText}</span>
      </div>

      {game.status === 'active' && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onResign}
          disabled={isResigning}
          className="text-muted-foreground hover:text-destructive flex-shrink-0"
        >
          {isResigning ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Flag className="size-4" />
          )}
          Resign
        </Button>
      )}
    </div>
  )
}
