import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
  type InfiniteData,
} from '@tanstack/react-query'
import {
  useQueryWithError,
  useInfiniteQueryWithError,
} from '@mochi/common'
import {
  gamesApi,
  type GetGamesResponse,
  type GetMessagesResponse,
  type SendMessageRequest,
  type SendMessageResponse,
  type GameViewResponse,
  type GetNewGameResponse,
  type CreateGameResponse,
  type MoveRequest,
  type MoveResponse,
  type ResignResponse,
  type DeleteResponse,
  type DrawOfferResponse,
} from '@/api/games'

export const gameKeys = {
  all: () => ['games'] as const,
  detail: (gameId: string) => ['games', gameId] as const,
  messages: (gameId: string) => ['games', gameId, 'messages'] as const,
  moveHistory: (gameId: string) => ['games', gameId, 'move-history'] as const,
  newGame: () => ['games', 'new'] as const,
}

export const useGameDetailQuery = (
  gameId?: string,
  options?: Omit<
    UseQueryOptions<
      GameViewResponse,
      Error,
      GameViewResponse,
      ReturnType<typeof gameKeys.detail>
    >,
    'queryKey' | 'queryFn'
  >
) =>
  useQueryWithError({
    queryKey: gameKeys.detail(gameId ?? 'unknown'),
    enabled: Boolean(gameId) && (options?.enabled ?? true),
    queryFn: () => {
      if (!gameId) {
        throw new Error('Game ID is required')
      }
      return gamesApi.detail(gameId)
    },
    ...options,
  })

export const useGamesQuery = (
  options?: Pick<
    UseQueryOptions<
      GetGamesResponse,
      Error,
      GetGamesResponse,
      ReturnType<typeof gameKeys.all>
    >,
    'enabled' | 'staleTime' | 'gcTime'
  >
) =>
  useQueryWithError({
    queryKey: gameKeys.all(),
    queryFn: () => gamesApi.list(),
    refetchInterval: 30000,
    ...options,
  })

const DEFAULT_PAGE_SIZE = 30
const MOVE_HISTORY_PAGE_SIZE = 100
const MAX_MOVE_HISTORY_PAGES = 20

export const useInfiniteMessagesQuery = (
  gameId?: string,
  options?: {
    enabled?: boolean
  }
) =>
  useInfiniteQueryWithError<GetMessagesResponse, Error, InfiniteData<GetMessagesResponse>, ReturnType<typeof gameKeys.messages>, number | undefined>({
    queryKey: gameKeys.messages(gameId ?? 'unknown'),
    enabled: Boolean(gameId) && (options?.enabled ?? true),
    initialPageParam: undefined,
    queryFn: ({ pageParam }) => {
      if (!gameId) {
        return Promise.resolve<GetMessagesResponse>({ messages: [] })
      }
      return gamesApi.messages(gameId, {
        before: pageParam,
        limit: DEFAULT_PAGE_SIZE,
      })
    },
    getNextPageParam: (lastPage, _allPages, _lastPageParam, allPageParams) => {
      if (!lastPage.hasMore) {
        return undefined
      }
      if (lastPage.nextCursor === undefined) {
        return undefined
      }
      if (allPageParams.includes(lastPage.nextCursor)) {
        return undefined
      }
      return lastPage.nextCursor
    },
  })

const fetchMoveHistory = async (gameId: string): Promise<string[]> => {
  const pages: GetMessagesResponse[] = []
  let before: number | undefined

  for (let pageCount = 0; pageCount < MAX_MOVE_HISTORY_PAGES; pageCount++) {
    const page = await gamesApi.messages(gameId, {
      before,
      limit: MOVE_HISTORY_PAGE_SIZE,
    })

    pages.push(page)

    if (!page.hasMore || page.nextCursor === undefined || page.nextCursor === before) {
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
        throw new Error('Game ID is required')
      }
      return fetchMoveHistory(gameId)
    },
    ...options,
  })

interface SendMessageVariables extends SendMessageRequest {
  gameId: string
}

export const useSendMessageMutation = (
  options?: UseMutationOptions<
    SendMessageResponse,
    Error,
    SendMessageVariables,
    unknown
  >
) => {
  const queryClient = useQueryClient()
  const { onSuccess, ...restOptions } = options ?? {}
  return useMutation({
    mutationFn: ({ gameId, ...payload }) =>
      gamesApi.sendMessage(gameId, payload),
    onSuccess: (data, variables, context, mutation) => {
      queryClient.invalidateQueries({
        queryKey: gameKeys.messages(variables.gameId),
      })
      onSuccess?.(data, variables, context, mutation)
    },
    ...restOptions,
  })
}

interface MoveVariables extends MoveRequest {
  gameId: string
}

export const useMoveMutation = (
  options?: UseMutationOptions<MoveResponse, Error, MoveVariables, unknown>
) => {
  const queryClient = useQueryClient()
  const { onSuccess, ...restOptions } = options ?? {}
  return useMutation({
    mutationFn: ({ gameId, ...payload }) => gamesApi.move(gameId, payload),
    onSuccess: (data, variables, context, mutation) => {
      queryClient.invalidateQueries({
        queryKey: gameKeys.messages(variables.gameId),
      })
      queryClient.invalidateQueries({
        queryKey: gameKeys.detail(variables.gameId),
      })
      queryClient.invalidateQueries({
        queryKey: gameKeys.moveHistory(variables.gameId),
      })
      queryClient.invalidateQueries({ queryKey: gameKeys.all() })
      onSuccess?.(data, variables, context, mutation)
    },
    ...restOptions,
  })
}

export const useNewGameFriendsQuery = (
  options?: Omit<
    UseQueryOptions<
      GetNewGameResponse,
      Error,
      GetNewGameResponse,
      ReturnType<typeof gameKeys.newGame>
    >,
    'queryKey' | 'queryFn'
  >
) =>
  useQueryWithError({
    queryKey: gameKeys.newGame(),
    queryFn: () => gamesApi.getFriendsForNewGame(),
    ...options,
  })

export const useCreateGameMutation = (
  options?: UseMutationOptions<
    CreateGameResponse,
    Error,
    string,
    unknown
  >
) => {
  const queryClient = useQueryClient()
  const { onSuccess, ...restOptions } = options ?? {}
  return useMutation({
    mutationFn: (opponent: string) => gamesApi.create(opponent),
    onSuccess: (data, variables, context, mutation) => {
      queryClient.invalidateQueries({ queryKey: gameKeys.all() })
      onSuccess?.(data, variables, context, mutation)
    },
    ...restOptions,
  })
}

interface ResignVariables {
  gameId: string
}

export const useResignMutation = (
  options?: UseMutationOptions<ResignResponse, Error, ResignVariables, unknown>
) => {
  const queryClient = useQueryClient()
  const { onSuccess, ...restOptions } = options ?? {}
  return useMutation({
    mutationFn: ({ gameId }: ResignVariables) => gamesApi.resign(gameId),
    onSuccess: (data, variables, context, mutation) => {
      queryClient.invalidateQueries({ queryKey: gameKeys.all() })
      queryClient.invalidateQueries({
        queryKey: gameKeys.detail(variables.gameId),
      })
      onSuccess?.(data, variables, context, mutation)
    },
    ...restOptions,
  })
}

interface DrawVariables {
  gameId: string
}

export const useDrawOfferMutation = (
  options?: UseMutationOptions<DrawOfferResponse, Error, DrawVariables, unknown>
) => {
  const queryClient = useQueryClient()
  const { onSuccess, ...restOptions } = options ?? {}
  return useMutation({
    mutationFn: ({ gameId }: DrawVariables) => gamesApi.drawOffer(gameId),
    onSuccess: (data, variables, context, mutation) => {
      queryClient.invalidateQueries({
        queryKey: gameKeys.detail(variables.gameId),
      })
      onSuccess?.(data, variables, context, mutation)
    },
    ...restOptions,
  })
}

export const useDrawAcceptMutation = (
  options?: UseMutationOptions<DrawOfferResponse, Error, DrawVariables, unknown>
) => {
  const queryClient = useQueryClient()
  const { onSuccess, ...restOptions } = options ?? {}
  return useMutation({
    mutationFn: ({ gameId }: DrawVariables) => gamesApi.drawAccept(gameId),
    onSuccess: (data, variables, context, mutation) => {
      queryClient.invalidateQueries({ queryKey: gameKeys.all() })
      queryClient.invalidateQueries({
        queryKey: gameKeys.detail(variables.gameId),
      })
      onSuccess?.(data, variables, context, mutation)
    },
    ...restOptions,
  })
}

export const useDrawDeclineMutation = (
  options?: UseMutationOptions<DrawOfferResponse, Error, DrawVariables, unknown>
) => {
  const queryClient = useQueryClient()
  const { onSuccess, ...restOptions } = options ?? {}
  return useMutation({
    mutationFn: ({ gameId }: DrawVariables) => gamesApi.drawDecline(gameId),
    onSuccess: (data, variables, context, mutation) => {
      queryClient.invalidateQueries({
        queryKey: gameKeys.detail(variables.gameId),
      })
      onSuccess?.(data, variables, context, mutation)
    },
    ...restOptions,
  })
}

interface DeleteGameVariables {
  gameId: string
}

export const useDeleteGameMutation = (
  options?: UseMutationOptions<DeleteResponse, Error, DeleteGameVariables, unknown>
) => {
  const queryClient = useQueryClient()
  const { onSuccess, ...restOptions } = options ?? {}
  return useMutation({
    mutationFn: ({ gameId }: DeleteGameVariables) => gamesApi.delete(gameId),
    onSuccess: (data, variables, context, mutation) => {
      queryClient.invalidateQueries({ queryKey: gameKeys.all() })
      onSuccess?.(data, variables, context, mutation)
    },
    ...restOptions,
  })
}
