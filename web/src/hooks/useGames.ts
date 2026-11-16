// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query'
import { createGameHooks } from '@mochi/web'
import { gamesApi, type CreateGameResponse } from '@/api/games'

// A move sends the position, status and winner the list row shows, so an
// accepted move is written into the list rather than the list downloaded again.
const shared = createGameHooks(gamesApi, { patch: true })

export const gameKeys = shared.gameKeys
export const gameKey = shared.gameKey

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
