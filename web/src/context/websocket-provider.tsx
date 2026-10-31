// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { GameWebsocketProvider } from '@mochi/web'
import { gameKey } from '@/hooks/useGames'

// The key comes through the page's own query for the game, so the socket
// joins that request rather than asking for the game a second time.
export const WebsocketProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient()
  return (
    <GameWebsocketProvider
      getGameKey={(gameId) => gameKey(queryClient, gameId)}
    >
      {children}
    </GameWebsocketProvider>
  )
}
