// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useCallback, useEffect, useState } from 'react'
import { useLingui } from '@lingui/react/macro'
import {
  useQueryClient,
  type QueryClient,
  type InfiniteData,
} from '@tanstack/react-query'
import type { GameMessage, GetMessagesResponse, GameViewResponse, GetGamesResponse } from '@/api/games'
import {
  type ChatWebsocketMessagePayload,
  type WebsocketConnectionStatus,
} from '@/lib/websocket-manager'
import { gameKeys } from '@/hooks/useGames'
import { useWebsocketManager } from '@/hooks/useWebsocketManager'

interface UseGameWebsocketResult {
  status: WebsocketConnectionStatus
  retries: number
  error?: string
  forceReconnect: () => void
}

const isSameMessage = (incoming: GameMessage, existing: GameMessage): boolean =>
  incoming.created === existing.created &&
  incoming.body === existing.body &&
  incoming.name === existing.name &&
  incoming.type === existing.type

const createMessageFromPayload = (
  gameId: string,
  payload: ChatWebsocketMessagePayload,
  unknownSenderLabel: string,
): GameMessage => {
  const created =
    typeof payload.created === 'number'
      ? payload.created
      : Math.floor(Date.now() / 1000)
  const messageBody =
    typeof payload.body === 'string' ? payload.body : String(payload.body ?? '')
  const senderName = typeof payload.name === 'string' ? payload.name : unknownSenderLabel
  const senderId = typeof payload.member === 'string' ? payload.member : ''
  const msgType = typeof payload.type === 'string' ? payload.type as GameMessage['type'] : 'message'
  const event = typeof payload.event === 'string' ? payload.event : undefined

  return {
    id: `ws-${gameId}-${created}-${Math.random().toString(36).slice(2)}`,
    game: gameId,
    body: messageBody,
    member: senderId,
    name: senderName,
    type: msgType,
    event,
    created,
  }
}

const handleWebsocketPayload = (
  gameId: string,
  payload: ChatWebsocketMessagePayload,
  queryClient: QueryClient,
  unknownSenderLabel: string,
) => {
  if (!gameId) return

  const msgType = payload.type as string | undefined
  const event = payload.event as string | undefined

  // Handle resign / draw accept — the payload carries the final state, so
  // patch the caches directly. Invalidating here would refetch view + list
  // a second time on the actor's side (their mutation already invalidates).
  if (event === 'resign' || event === 'draw_accept') {
    const status = event === 'resign' ? ('resigned' as const) : ('draw' as const)
    const winner =
      typeof payload.winner === 'string' && payload.winner ? payload.winner : null
    queryClient.setQueryData<GameViewResponse>(
      gameKeys.detail(gameId),
      (current) => {
        if (!current) return current
        return {
          ...current,
          game: {
            ...current.game,
            status,
            winner: winner ?? current.game.winner,
            draw_offer: null,
          },
        }
      }
    )
    queryClient.setQueryData<GetGamesResponse>(gameKeys.all(), (current) => {
      if (!current) return current
      return {
        ...current,
        games: current.games.map((g) =>
          g.id === gameId
            ? { ...g, status, winner: winner ?? g.winner, draw_offer: null }
            : g
        ),
      }
    })
  }

  // Handle draw offer / decline — update draw_offer in cache
  if (event === 'draw_offer' || event === 'draw_decline') {
    queryClient.setQueryData<GameViewResponse>(
      gameKeys.detail(gameId),
      (current) => {
        if (!current) return current
        return {
          ...current,
          game: {
            ...current.game,
            draw_offer: (payload.draw_offer as string) || null,
          },
        }
      }
    )
  }

  // Any non-move payload carrying a board is a complete applied snapshot -
  // a system event whose snapshot repaired a move this client never saw, or a
  // 'state' payload from reconciliation. Merge on the presence of the board
  // rather than on which event produced it.
  // Any non-move payload carrying a board is a complete applied snapshot - a
  // system event whose snapshot repaired a move this client never saw, or a
  // reconciliation 'state' payload. Refetch rather than merging field by
  // field: a snapshot REPLACES state, and a merge cannot clear a value the
  // way an exact replacement does - an emptied winner or draw offer is falsy,
  // so `payload.x || current.x` silently keeps the stale one. Refetching also
  // updates the list, which a detail-only merge left showing the old status.
  if (msgType !== 'move' && payload.fen) {
    void queryClient.invalidateQueries({
      queryKey: gameKeys.detail(gameId),
      exact: true,
    })
    void queryClient.invalidateQueries({ queryKey: gameKeys.all(), exact: true })
  }

  // Handle move — update game detail cache with new FEN/status
  if (msgType === 'move') {
    queryClient.setQueryData<GameViewResponse>(
      gameKeys.detail(gameId),
      (current) => {
        if (!current) return current
        return {
          ...current,
          game: {
            ...current.game,
            fen: (payload.fen as string) || current.game.fen,
            pgn: (payload.pgn as string) ?? current.game.pgn,
            status: (payload.status as GameViewResponse['game']['status']) || current.game.status,
            winner: (payload.winner as string) || current.game.winner,
            draw_offer: null,
          },
        }
      }
    )

    // The merge above is for responsiveness only; a move payload is a
    // complete snapshot like any other, and the merge cannot clear falsy
    // fields (an emptied winner survives `payload.x || current.x`) or
    // update the list, which otherwise shows "active" after a remote
    // checkmate. Authoritative state comes from the refetch, and it runs
    // UNCONDITIONALLY. An own-echo guard used to sit here and had two holes:
    // the server emits this frame before the HTTP response returns, so a
    // response lost after commit consumed the marker and left the list
    // stale; and the marker was keyed by game alone, so a failed move's
    // marker could swallow the echo of another window's successful one. One
    // redundant refetch per own move is the price of not coupling
    // correctness to HTTP/websocket ordering.
    void queryClient.invalidateQueries({
      queryKey: gameKeys.moveHistory(gameId),
    })
    void queryClient.invalidateQueries({
      queryKey: gameKeys.detail(gameId),
      exact: true,
    })
    void queryClient.invalidateQueries({ queryKey: gameKeys.all(), exact: true })
  }

  // Append message to messages cache for all types (message, move, system)
  // A reconciliation snapshot is a cache signal, not something that happened
  // in the game: it repairs state this client missed and has no message of its
  // own. Appending one would put an empty system entry in the chat.
  if (msgType === 'state') return

  const incomingMessage = createMessageFromPayload(gameId, payload, unknownSenderLabel)

  queryClient.setQueryData<InfiniteData<GetMessagesResponse>>(
    gameKeys.messages(gameId),
    (current) => {
      if (!current || !current.pages || current.pages.length === 0) {
        return {
          pages: [{ messages: [incomingMessage] }],
          pageParams: [undefined],
        }
      }

      const alreadyExists = current.pages.some((page) =>
        page.messages.some((message) => isSameMessage(incomingMessage, message))
      )

      if (alreadyExists) return current

      const updatedPages = current.pages.map((page, index) => {
        if (index === 0) {
          return {
            ...page,
            messages: [...page.messages, incomingMessage],
          }
        }
        return page
      })

      return {
        ...current,
        pages: updatedPages,
      }
    }
  )
}

export const useGameWebsocket = (
  gameId?: string,
  gameKey?: string
): UseGameWebsocketResult => {
  const { t } = useLingui()
  const unknownSenderLabel = t`Unknown`
  const manager = useWebsocketManager()
  const queryClient = useQueryClient()
  const [snapshot, setSnapshot] = useState<{
    status: WebsocketConnectionStatus
    retries: number
    lastError?: string
  } | null>(null)

  useEffect(() => {
    setSnapshot(null)

    if (!gameId || !manager) {
      return undefined
    }

    const unsubscribe = manager.subscribe(gameId, {
      chatKey: gameKey,
      onMessage: (event) => {
        handleWebsocketPayload(event.chatId, event.payload, queryClient, unknownSenderLabel)
      },
      onStatusChange: (nextSnapshot) => {
        setSnapshot(nextSnapshot)
      },
    })

    return () => {
      unsubscribe()
    }
  }, [gameId, gameKey, manager, queryClient])

  const forceReconnect = useCallback(() => {
    if (gameId && manager) {
      manager.forceReconnect(gameId)
    }
  }, [gameId, manager])

  return {
    status: snapshot?.status ?? 'idle',
    retries: snapshot?.retries ?? 0,
    error: snapshot?.lastError,
    forceReconnect,
  }
}
