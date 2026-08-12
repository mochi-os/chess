// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from '@tanstack/react-query'
import { createGameHooks, useQueryWithError } from '@mochi/web'
import {
  gamesApi,
  type GetMessagesResponse,
  type CreateGameResponse,
} from '@/api/games'

// Chess is the only one of the games with a move list, so its key and the query
// behind it stay here. Everything else is the shared game data layer.
const moveHistoryKey = (gameId: string) =>
  ['games', gameId, 'move-history'] as const

const shared = createGameHooks(gamesApi, {
  extraMoveKeys: (gameId) => [moveHistoryKey(gameId)],
})

export const gameKeys = {
  ...shared.gameKeys,
  moveHistory: moveHistoryKey,
}

export const {
  useGameDetailQuery,
  useGamesQuery,
  useInfiniteMessagesQuery,
  useSendMessageMutation,
  useMoveMutation,
  useNewGameFriendsQuery,
  useResignMutation,
  useDrawOfferMutation,
  useDrawAcceptMutation,
  useDrawDeclineMutation,
  useDeleteGameMutation,
} = shared

const MOVE_HISTORY_PAGE_SIZE = 100
const MAX_MOVE_HISTORY_PAGES = 20

const fetchMoveHistory = async (gameId: string): Promise<string[]> => {
  const pages: GetMessagesResponse[] = []
  let before: string | undefined

  for (let pageCount = 0; pageCount < MAX_MOVE_HISTORY_PAGES; pageCount++) {
    const page = await gamesApi.messages(gameId, {
      before,
      limit: MOVE_HISTORY_PAGE_SIZE,
    })

    pages.push(page)

    if (
      !page.hasMore ||
      page.nextCursor === undefined ||
      page.nextCursor === before
    ) {
      break
    }

    before = page.nextCursor
  }

  return [...pages]
    .reverse()
    .flatMap((page) => page.messages)
    .filter((message) => message.type === 'move')
    .map((message) => message.body.trim())
    .filter((body) => body.length > 0)
}

export const useMoveHistoryQuery = (
  gameId?: string,
  options?: Omit<
    UseQueryOptions<
      string[],
      Error,
      string[],
      ReturnType<typeof gameKeys.moveHistory>
    >,
    'queryKey' | 'queryFn'
  >
) =>
  useQueryWithError({
    queryKey: gameKeys.moveHistory(gameId ?? 'unknown'),
    enabled: Boolean(gameId) && (options?.enabled ?? true),
    staleTime: Infinity,
    queryFn: () => {
      if (!gameId) {
        throw new Error("Game ID is required")
      }
      return fetchMoveHistory(gameId)
    },
    ...options,
  })

export const useCreateGameMutation = (
  options?: UseMutationOptions<CreateGameResponse, Error, string, unknown>
) => {
  const queryClient = useQueryClient()
  const { onSuccess, ...restOptions } = options ?? {}
  return useMutation({
    mutationFn: (opponent: string) => gamesApi.create(opponent),
    onSuccess: (data, variables, context, mutation) => {
      queryClient.invalidateQueries({ queryKey: gameKeys.all(), exact: true })
      onSuccess?.(data, variables, context, mutation)
    },
    ...restOptions,
  })
}
