// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useEffect, useMemo, type ReactNode } from 'react'
import { useAuthStore } from '@mochi/web'
import { gamesApi } from '@/api/games'
import {
  ChatWebsocketManager,
  type ChatWebsocketManagerOptions,
} from '@/lib/websocket-manager'
import { WebsocketContext } from '@/context/websocket-context'

const buildManager = (): ChatWebsocketManager | null => {
  if (typeof window === 'undefined') {
    return null
  }

  const baseOptions: ChatWebsocketManagerOptions = {
    baseUrl: import.meta.env.VITE_WEBSOCKET_URL ?? window.location.origin,
    getToken: () => useAuthStore.getState().token,
    getChatKey: async (gameId: string) => {
      try {
        const response = await gamesApi.detail(gameId)
        return response.game.key
      } catch (error) {
        if (import.meta.env.DEV) {
          /* eslint-disable lingui/no-unlocalized-strings -- dev-only diagnostic log, not user-facing */
          globalThis.console?.error?.(
            '[WebSocket] Failed to fetch game key',
            gameId,
            error
          )
          /* eslint-enable lingui/no-unlocalized-strings */
        }
        return undefined
      }
    },
  }

  return new ChatWebsocketManager(baseOptions)
}

export const WebsocketProvider = ({ children }: { children: ReactNode }) => {
  const manager = useMemo(() => buildManager(), [])

  useEffect(() => {
    return () => {
      manager?.dispose()
    }
  }, [manager])

  return (
    <WebsocketContext.Provider value={manager}>
      {children}
    </WebsocketContext.Provider>
  )
}
