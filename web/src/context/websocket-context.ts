import { createContext } from 'react'
import type { ChatWebsocketManager } from '@/lib/websocket-manager'

export const WebsocketContext = createContext<ChatWebsocketManager | null>(null)

