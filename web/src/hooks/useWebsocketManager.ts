import { useContext } from 'react'
import { WebsocketContext } from '@/context/websocket-context'

export const useWebsocketManager = () => {
  return useContext(WebsocketContext)
}

