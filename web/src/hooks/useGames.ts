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

const shared = createGameHooks(gamesApi)

export const gameKeys = shared.gameKeys

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
