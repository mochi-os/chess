// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { createFileRoute, redirect } from '@tanstack/react-router'
import { ChessGame } from '@/features/chess'
import { getLastGame, clearLastGame } from '@/hooks/useGameStorage'
import { gamesApi } from '@/api/games'

export const Route = createFileRoute('/_authenticated/')({
  loader: async () => {
    let games: Awaited<ReturnType<typeof gamesApi.list>>['games'] = []
    try {
      const response = await gamesApi.list()
      games = response.games || []
    } catch {
      // Soft-fail: game list ownership stays with useGamesQuery in the page.
    }

    const lastGameId = await getLastGame()
    if (lastGameId) {
      const gameExists = games.some(
        g => g.id === lastGameId || g.fingerprint === lastGameId
      )
      if (gameExists) {
        throw redirect({ to: '/$gameId', params: { gameId: lastGameId } })
      } else {
        clearLastGame()
      }
    }

    return { games }
  },
  component: ChessGame,
})
