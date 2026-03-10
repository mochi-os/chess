import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import {
  getWebsocketStatusMeta,
  type WebsocketStatusMeta,
} from '@mochi/common'
import type { WebsocketConnectionStatus } from '@/lib/websocket-manager'

type SidebarContextValue = {
  gameId: string | null
  gameName: string | null
  setGame: (id: string | null, name?: string) => void
  newGameDialogOpen: boolean
  openNewGameDialog: () => void
  closeNewGameDialog: () => void
  websocketStatus: WebsocketConnectionStatus
  websocketStatusMeta: WebsocketStatusMeta
  setWebsocketStatus: (
    status: WebsocketConnectionStatus,
    retries?: number
  ) => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [gameId, setGameId] = useState<string | null>(null)
  const [gameName, setGameName] = useState<string | null>(null)
  const [newGameDialogOpen, setNewGameDialogOpen] = useState(false)
  const [websocketStatus, setWsStatus] =
    useState<WebsocketConnectionStatus>('idle')
  const [websocketRetries, setWebsocketRetries] = useState(0)

  const setGame = useCallback((id: string | null, name?: string) => {
    setGameId(id)
    setGameName(name ?? null)
  }, [])

  const openNewGameDialog = useCallback(() => {
    setNewGameDialogOpen(true)
  }, [])

  const closeNewGameDialog = useCallback(() => {
    setNewGameDialogOpen(false)
  }, [])

  const setWebsocketStatus = useCallback(
    (status: WebsocketConnectionStatus, retries = 0) => {
      setWsStatus(status)
      setWebsocketRetries(retries)
    },
    []
  )

  const websocketStatusMeta = getWebsocketStatusMeta(
    websocketStatus,
    websocketRetries
  )

  return (
    <SidebarContext.Provider
      value={{
        gameId,
        gameName,
        setGame,
        newGameDialogOpen,
        openNewGameDialog,
        closeNewGameDialog,
        websocketStatus,
        websocketStatusMeta,
        setWebsocketStatus,
      }}
    >
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebarContext() {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebarContext must be used within a SidebarProvider')
  }
  return context
}
