import { useContext } from 'react'
import { WebsocketContext } from '@/context/websocket-context'

export const useWebsocketManager = () => {
  const manager = useContext(WebsocketContext)
  if (!manager) {
    throw new Error(
      'useWebsocketManager must be used within a WebsocketProvider'
    )
  }
  return manager
}

