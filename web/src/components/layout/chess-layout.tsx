// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useCallback, useMemo } from 'react'
import { useLingui } from '@lingui/react/macro'
import { Outlet } from '@tanstack/react-router'
import { GameRouteLayout, useAuthStore } from '@mochi/web'
import { useGamesQuery } from '@/hooks/useGames'
import { NewGame } from '@/features/chess/components/new-game'
import { getOpponentName, type Game } from '@/api/games'

export function ChessLayout() {
  const { t } = useLingui()
  const gamesQuery = useGamesQuery()
  const games = useMemo(
    () => gamesQuery.data?.games ?? [],
    [gamesQuery.data?.games]
  )
  const { identity: myIdentity } = useAuthStore()

  const gameTitle = useCallback(
    (game: Game) =>
      myIdentity ? getOpponentName(game, myIdentity) : game.opponent_name,
    [myIdentity]
  )

  const opponentId = useCallback(
    (game: Game) =>
      myIdentity && game.identity === myIdentity ? game.opponent : game.identity,
    [myIdentity]
  )

  return (
    <GameRouteLayout
      games={games}
      appName="chess"
      gameTitle={gameTitle}
      opponentId={opponentId}
      labels={{
        active: t`Active games`,
        completed: t`Completed`,
        newGame: t`New game`,
      }}
      newGameDialog={<NewGame />}
    >
      <Outlet />
    </GameRouteLayout>
  )
}
