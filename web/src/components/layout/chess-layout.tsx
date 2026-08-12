// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useCallback, useEffect, useMemo } from 'react'
import { useLingui } from '@lingui/react/macro'
import { Outlet, useParams } from '@tanstack/react-router'
import { GameLayout, useAuthStore } from '@mochi/web'
import { SidebarProvider, useSidebarContext } from '@/context/sidebar-context'
import { useGamesQuery } from '@/hooks/useGames'
import { NewGame } from '@/features/chess/components/new-game'
import { getOpponentName, type Game } from '@/api/games'

function ChessLayoutInner() {
  const { t } = useLingui()
  const gamesQuery = useGamesQuery()
  const games = useMemo(
    () => gamesQuery.data?.games ?? [],
    [gamesQuery.data?.games]
  )
  const { setGame, openNewGameDialog, websocketStatusMeta, gameId } =
    useSidebarContext()
  const { identity: myIdentity } = useAuthStore()

  const params = useParams({ strict: false }) as { gameId?: string }
  const urlGameId = params?.gameId

  useEffect(() => {
    if (urlGameId) {
      setGame(urlGameId)
    } else {
      setGame(null)
    }
  }, [urlGameId, games, myIdentity, setGame])

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
    <GameLayout
      games={games}
      appName="chess"
      gameTitle={gameTitle}
      opponentId={opponentId}
      onNewGame={openNewGameDialog}
      websocketStatus={gameId ? websocketStatusMeta : null}
      labels={{
        active: t`Active games`,
        completed: t`Completed`,
        newGame: t`New game`,
      }}
    >
      <Outlet />
    </GameLayout>
  )
}

export function ChessLayout() {
  return (
    <SidebarProvider>
      <ChessLayoutInner />
      <NewGame />
    </SidebarProvider>
  )
}
