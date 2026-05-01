import { Button, EmptyState } from '@mochi/web'
import { Trans } from '@lingui/react/macro'
import { Plus, Swords } from 'lucide-react'

interface GameEmptyStateProps {
  onNewGame: () => void
  hasExistingGames: boolean
}

export function GameEmptyState({ onNewGame, hasExistingGames }: GameEmptyStateProps) {
  if (hasExistingGames) {
    return (
      <div className="flex h-full w-full flex-1 flex-col items-center justify-center">
        <EmptyState
          icon={Swords}
          title={"Select a game"}
          description={"Choose a game from the sidebar or start a new one."}
        >
          <Button onClick={onNewGame} variant="outline">
            <Plus className="size-4" />
            <Trans>New game</Trans>
          </Button>
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-1 flex-col items-center justify-center">
      <EmptyState
        icon={Swords}
        title={"No games yet"}
        description=""
      >
        <Button size="lg" onClick={onNewGame}>
          <Plus className="size-5" />
          <Trans>New game</Trans>
        </Button>
      </EmptyState>
    </div>
  )
}
