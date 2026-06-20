// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { Button, EmptyState } from '@mochi/web'
import { Trans } from '@lingui/react/macro'
import { Plus, Swords } from 'lucide-react'
import { t } from '@lingui/core/macro'

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
          title={t`Select a game`}
          description={t`Choose a game from the sidebar or start a new one.`}
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
        title={t`No games yet`}
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
