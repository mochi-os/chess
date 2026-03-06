// WebSocket manager — generic, works with any app

const devConsole = globalThis.console

export type WebsocketConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'ready'
  | 'closing'
  | 'error'

export interface WebsocketConnectionSnapshot {
  chatId: string
  status: WebsocketConnectionStatus
  retries: number
  lastError?: string
}

export interface ChatWebsocketMessagePayload {
  body?: string
  member?: string
  name?: string
  created?: number
  attachments?: unknown[]
  [key: string]: unknown
}

export interface ChatWebsocketEvent {
  chatId: string
  payload: ChatWebsocketMessagePayload
}

export type ChatWebsocketListener = (event: ChatWebsocketEvent) => void
export type ChatWebsocketStatusListener = (
  snapshot: WebsocketConnectionSnapshot
) => void

export interface ChatWebsocketManagerOptions {
  baseUrl?: string
  idleDisconnectMs?: number
  baseDelayMs?: number
  maxDelayMs?: number
  maxRetries?: number
  getChatKey?: (chatId: string) => Promise<string | undefined>
}

interface ConnectionEntry {
  chatId: string
  key?: string
  status: WebsocketConnectionStatus
  retries: number
  socket?: WebSocket
  reconnectTimer?: ReturnType<typeof setTimeout>
  idleTimer?: ReturnType<typeof setTimeout>
  connectPromise?: Promise<void>
  keyPromise?: Promise<string | undefined>
  closingReason?: 'idle' | 'manual' | 'force'
  pendingReconnect?: boolean
  lastError?: string
  messageListeners: Set<ChatWebsocketListener>
  statusListeners: Set<ChatWebsocketStatusListener>
}

const DEFAULT_BASE_DELAY = 1000
const DEFAULT_MAX_DELAY = 30_000
const DEFAULT_MAX_RETRIES = 10
const DEFAULT_IDLE_DISCONNECT = 10_000

const toWssUrl = (rawUrl: string): string => {
  if (typeof window === 'undefined') {
    throw new Error('window is not defined')
  }
  const origin = window.location.origin
  const url = new URL(rawUrl || origin, origin)
  if (url.protocol === 'http:') url.protocol = 'ws:'
  else if (url.protocol === 'https:') url.protocol = 'wss:'
  url.pathname = url.pathname.replace(/\/+$/, '') + '/websocket'
  return url.toString()
}

export class ChatWebsocketManager {
  private readonly baseUrl: string
  private readonly idleDisconnectMs: number
  private readonly baseDelayMs: number
  private readonly maxDelayMs: number
  private readonly maxRetries: number
  private readonly getChatKey?: (chatId: string) => Promise<string | undefined>
  private readonly connections = new Map<string, ConnectionEntry>()
  private disposed = false
  private online: boolean

  constructor(options: ChatWebsocketManagerOptions = {}) {
    const fallbackUrl =
      typeof window !== 'undefined'
        ? window.location.origin
        : 'http://localhost'
    this.baseUrl =
      options.baseUrl ?? import.meta.env.VITE_WEBSOCKET_URL ?? fallbackUrl
    this.idleDisconnectMs = options.idleDisconnectMs ?? DEFAULT_IDLE_DISCONNECT
    this.baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY
    this.maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
    this.getChatKey = options.getChatKey
    this.online = typeof navigator === 'undefined' ? true : navigator.onLine

    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline)
      window.addEventListener('offline', this.handleOffline)
    }
  }

  subscribe(
    chatId: string,
    options: {
      chatKey?: string
      onMessage?: ChatWebsocketListener
      onStatusChange?: ChatWebsocketStatusListener
    }
  ): () => void {
    const entry = this.getOrCreateEntry(chatId)

    if (options.chatKey && options.chatKey !== entry.key) {
      entry.key = options.chatKey
    }

    if (options.onMessage) {
      entry.messageListeners.add(options.onMessage)
    }

    if (options.onStatusChange) {
      entry.statusListeners.add(options.onStatusChange)
    }

    if (options.onStatusChange) {
      options.onStatusChange(this.snapshot(entry))
    }

    this.clearIdleTimer(entry)

    if (this.hasListeners(entry)) {
      if (this.online) {
        void this.ensureSocket(entry)
      } else {
        this.updateStatus(entry, 'error', 'offline')
      }
    }

    return () => {
      if (options.onMessage) {
        entry.messageListeners.delete(options.onMessage)
      }
      if (options.onStatusChange) {
        entry.statusListeners.delete(options.onStatusChange)
      }
      if (!this.hasListeners(entry)) {
        this.scheduleIdleClose(entry)
      }
    }
  }

  forceReconnect(chatId: string) {
    const entry = this.connections.get(chatId)
    if (!entry) return
    entry.retries = 0
    entry.pendingReconnect = false
    this.clearReconnectTimer(entry)
    this.closeSocket(entry, 'force')
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.connections.forEach((entry) => {
      this.clearReconnectTimer(entry)
      this.clearIdleTimer(entry)
      this.closeSocket(entry, 'manual')
    })
    this.connections.clear()
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline)
      window.removeEventListener('offline', this.handleOffline)
    }
  }

  private getOrCreateEntry(chatId: string): ConnectionEntry {
    const existing = this.connections.get(chatId)
    if (existing) {
      return existing
    }

    const entry: ConnectionEntry = {
      chatId,
      status: 'idle',
      retries: 0,
      messageListeners: new Set(),
      statusListeners: new Set(),
    }

    this.connections.set(chatId, entry)
    return entry
  }

  private hasListeners(entry: ConnectionEntry): boolean {
    return entry.messageListeners.size > 0 || entry.statusListeners.size > 0
  }

  private snapshot(entry: ConnectionEntry): WebsocketConnectionSnapshot {
    return {
      chatId: entry.chatId,
      status: entry.status,
      retries: entry.retries,
      lastError: entry.lastError,
    }
  }

  private async ensureSocket(entry: ConnectionEntry): Promise<void> {
    if (this.disposed || !this.hasListeners(entry)) {
      return
    }

    if (entry.socket || entry.connectPromise) {
      return entry.connectPromise
    }

    entry.connectPromise = this.openSocket(entry)
    try {
      await entry.connectPromise
    } finally {
      entry.connectPromise = undefined
    }
  }

  private async openSocket(entry: ConnectionEntry): Promise<void> {
    const chatKey = await this.resolveChatKey(entry)
    if (!chatKey) {
      this.updateStatus(entry, 'error', 'missing-key')
      return
    }

    if (!this.hasListeners(entry)) {
      return
    }

    const websocketUrl = toWssUrl(this.baseUrl)
    const socketUrl = new URL(websocketUrl)
    socketUrl.searchParams.set('key', chatKey)

    try {
      const socket = new WebSocket(socketUrl.toString())
      entry.socket = socket
      this.updateStatus(entry, 'connecting')
      socket.onopen = () => {
        entry.retries = 0
        entry.pendingReconnect = false
        this.updateStatus(entry, 'ready')
      }
      socket.onmessage = (event) => {
        this.handleMessage(entry, event)
      }
      socket.onerror = (event) => {
        if (import.meta.env.DEV) {
          devConsole?.warn?.(`[WebSocket] ${entry.chatId} error`, event)
        }
        this.updateStatus(entry, 'error', 'socket-error')
      }
      socket.onclose = (event) => {
        this.handleClose(entry, event)
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        devConsole?.error?.(
          `[WebSocket] Failed to connect for ${entry.chatId}`,
          error
        )
      }
      this.updateStatus(entry, 'error', 'connect-failed')
      this.scheduleReconnect(entry)
    }
  }

  private async resolveChatKey(
    entry: ConnectionEntry
  ): Promise<string | undefined> {
    if (entry.key) {
      return entry.key
    }

    if (!this.getChatKey) {
      return undefined
    }

    if (!entry.keyPromise) {
      entry.keyPromise = this.getChatKey(entry.chatId).finally(() => {
        entry.keyPromise = undefined
      })
    }

    entry.key = await entry.keyPromise
    return entry.key
  }

  private handleMessage(entry: ConnectionEntry, event: MessageEvent) {
    const deliver = (payload: ChatWebsocketMessagePayload | null) => {
      if (!payload) {
        return
      }

      const chatEvent: ChatWebsocketEvent = {
        chatId: entry.chatId,
        payload,
      }

      entry.messageListeners.forEach((listener) => {
        try {
          listener(chatEvent)
        } catch (error) {
          if (import.meta.env.DEV) {
            devConsole?.error?.(
              `[WebSocket] listener error for ${entry.chatId}`,
              error
            )
          }
        }
      })
    }

    if (typeof event.data === 'string') {
      deliver(this.safeParse(event.data))
      return
    }

    if (
      typeof Blob !== 'undefined' &&
      event.data instanceof Blob &&
      typeof event.data.text === 'function'
    ) {
      void event.data
        .text()
        .then((text) => deliver(this.safeParse(text)))
        .catch((error) => {
          if (import.meta.env.DEV) {
            devConsole?.error?.(
              `[WebSocket] Failed to parse blob message for ${entry.chatId}`,
              error
            )
          }
        })
      return
    }

    // Attempt to treat non-string payloads as already parsed
    if (event.data && typeof event.data === 'object') {
      deliver(event.data as ChatWebsocketMessagePayload)
    }
  }

  private safeParse(raw: string): ChatWebsocketMessagePayload | null {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        return parsed as ChatWebsocketMessagePayload
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        devConsole?.error?.('[WebSocket] Failed to parse payload', raw, error)
      }
    }
    return null
  }

  private handleClose(entry: ConnectionEntry, event: CloseEvent) {
    entry.socket = undefined
    const reason = entry.closingReason
    entry.closingReason = undefined

    if (reason === 'idle') {
      this.updateStatus(entry, 'idle')
      return
    }

    if (reason === 'manual') {
      this.updateStatus(entry, 'idle')
      return
    }

    if (reason === 'force') {
      this.updateStatus(entry, 'connecting')
      if (this.online) {
        void this.ensureSocket(entry)
      } else {
        entry.pendingReconnect = true
        this.updateStatus(entry, 'error', 'offline')
      }
      return
    }

    if (event.wasClean) {
      this.updateStatus(entry, 'idle')
      return
    }

    this.updateStatus(entry, 'error', 'disconnected')
    this.scheduleReconnect(entry)
  }

  private scheduleReconnect(entry: ConnectionEntry) {
    if (!this.hasListeners(entry)) {
      return
    }

    if (entry.retries >= this.maxRetries) {
      entry.lastError = 'max-retries'
      this.updateStatus(entry, 'error', 'max-retries')
      return
    }

    if (entry.reconnectTimer) {
      return
    }

    const attempt = entry.retries + 1
    const rawDelay = Math.min(
      this.maxDelayMs,
      this.baseDelayMs * 2 ** (attempt - 1)
    )
    const jitterFactor = 0.85 + Math.random() * 0.3
    const delay = attempt === 1 ? 0 : Math.round(rawDelay * jitterFactor)

    entry.reconnectTimer = setTimeout(() => {
      this.clearReconnectTimer(entry)
      if (!this.hasListeners(entry)) {
        return
      }
      if (!this.online) {
        entry.pendingReconnect = true
        return
      }
      entry.retries = attempt
      this.updateStatus(entry, 'connecting')
      void this.ensureSocket(entry)
    }, delay)
  }

  private closeSocket(
    entry: ConnectionEntry,
    reason: ConnectionEntry['closingReason']
  ) {
    if (!entry.socket) {
      if (reason === 'force' && this.online && this.hasListeners(entry)) {
        void this.ensureSocket(entry)
      }
      return
    }

    entry.closingReason = reason
    this.updateStatus(entry, 'closing')
    try {
      entry.socket.close()
    } catch (error) {
      if (import.meta.env.DEV) {
        devConsole?.error?.(
          `[WebSocket] Failed to close socket for ${entry.chatId}`,
          error
        )
      }
    } finally {
      entry.socket = undefined
    }
  }

  private scheduleIdleClose(entry: ConnectionEntry) {
    if (entry.idleTimer || !entry.socket) {
      return
    }
    entry.idleTimer = setTimeout(() => {
      this.clearIdleTimer(entry)
      if (this.hasListeners(entry)) {
        return
      }
      this.closeSocket(entry, 'idle')
    }, this.idleDisconnectMs)
  }

  private clearReconnectTimer(entry: ConnectionEntry) {
    if (entry.reconnectTimer) {
      clearTimeout(entry.reconnectTimer)
      entry.reconnectTimer = undefined
    }
  }

  private clearIdleTimer(entry: ConnectionEntry) {
    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer)
      entry.idleTimer = undefined
    }
  }

  private updateStatus(
    entry: ConnectionEntry,
    status: WebsocketConnectionStatus,
    errorMessage?: string
  ) {
    entry.status = status
    entry.lastError = errorMessage
    const snapshot = this.snapshot(entry)
    entry.statusListeners.forEach((listener) => {
      try {
        listener(snapshot)
      } catch (error) {
        if (import.meta.env.DEV) {
          devConsole?.error?.(
            `[WebSocket] status listener error for ${entry.chatId}`,
            error
          )
        }
      }
    })
  }

  private readonly handleOnline = () => {
    this.online = true
    this.connections.forEach((entry) => {
      if (!this.hasListeners(entry)) {
        return
      }
      if (!entry.socket || entry.pendingReconnect) {
        entry.pendingReconnect = false
        entry.retries = 0
        void this.ensureSocket(entry)
      }
    })
  }

  private readonly handleOffline = () => {
    this.online = false
    this.connections.forEach((entry) => {
      this.clearReconnectTimer(entry)
      entry.pendingReconnect = true
      this.updateStatus(entry, 'error', 'offline')
    })
  }
}

