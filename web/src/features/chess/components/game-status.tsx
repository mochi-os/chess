import { getOpponentName, type Game } from '@/api/games'

interface GameStatusProps {
  game: Game
  myColor: 'w' | 'b'
  isMyTurn: boolean
  isCheck: boolean
  myIdentity: string
  children?: React.ReactNode
}

export function GameStatus({
  game,
  myColor,
  isMyTurn,
  isCheck,
  myIdentity,
  children,
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
    <div className="flex items-center gap-2 px-1 py-1">
      <div className="flex items-center gap-1.5">
        <span className="text-lg">{myColor === 'w' ? '\u2654' : '\u265A'}</span>
        <span className="text-sm text-muted-foreground">
          Playing as {colorLabel}
        </span>
      </div>
      <span className="text-muted-foreground">·</span>
      <span className="text-sm font-medium truncate">{statusText}</span>
      {children && <div className="ml-auto shrink-0">{children}</div>}
    </div>
  )
}
