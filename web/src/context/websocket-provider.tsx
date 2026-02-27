import { useEffect, useMemo, type ReactNode } from 'react'
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
    getChatKey: async (gameId: string) => {
      try {
        const response = await gamesApi.detail(gameId)
        return response.game.key
      } catch (error) {
        if (import.meta.env.DEV) {
          globalThis.console?.error?.(
            '[WebSocket] Failed to fetch game key',
            gameId,
            error
          )
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

  if (!manager) {
    return children
  }

  return (
    <WebsocketContext.Provider value={manager}>
      {children}
    </WebsocketContext.Provider>
  )
}
