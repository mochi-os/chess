// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { createFileRoute, redirect } from '@tanstack/react-router'
import { ChessGame } from '@/features/chess'
import { getLastGame, clearLastGame } from '@/hooks/useGameStorage'
import { gamesApi } from '@/api/games'
import { gameKeys } from '@/hooks/useGames'

export const Route = createFileRoute('/_authenticated/')({
  loader: async ({ context }) => {
    // null means the request failed, which is not the same as a successful
    // empty list: only the second is evidence the last game is gone, and a
    // network blip or a 500 must not make us forget it.
    let games: Awaited<ReturnType<typeof gamesApi.list>>['games'] | null = null
    try {
      const response = await gamesApi.list()
      games = response.games || []
      // Seed the shared cache: without this the page's useGamesQuery fetches
      // the same list again on mount.
      context.queryClient.setQueryData(gameKeys.all(), response)
    } catch {
      // Soft-fail: game list ownership stays with useGamesQuery in the page.
    }

    const lastGameId = await getLastGame()
    if (lastGameId && games) {
      const gameExists = games.some(
        g => g.id === lastGameId
      )
      if (gameExists) {
        throw redirect({ to: '/$gameId', params: { gameId: lastGameId } })
      } else {
        clearLastGame()
      }
    }

    return { games: games ?? [] }
  },
  component: ChessGame,
})
