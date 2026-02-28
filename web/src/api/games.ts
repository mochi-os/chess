import { createAppClient } from '@mochi/common'
import type {
  Game,
  GameViewResponse,
  GetGamesResponse,
  GetMessagesResponse,
  GetNewGameResponse,
  CreateGameResponse,
  SendMessageRequest,
  SendMessageResponse,
  MoveRequest,
  MoveResponse,
  ResignResponse,
  DeleteResponse,
  DrawOfferResponse,
} from './types/games'
import endpoints from './endpoints'

export * from './types/games'

const client = createAppClient({ appName: 'chess' })

const unwrapData = <T>(raw: unknown): T => {
  if (raw && typeof raw === 'object' && 'data' in raw) {
    return (raw as { data: T }).data
  }
  return raw as T
}

export const gamesApi = {
  list: (): Promise<GetGamesResponse> =>
    client
      .get<{ data: Game[] }>(endpoints.game.list)
      .then((res) => ({ games: res.data })),

  detail: (gameId: string) =>
    client
      .get<GameViewResponse | { data: GameViewResponse }>(
        endpoints.game.detail(gameId)
      )
      .then((res) => unwrapData<GameViewResponse>(res)),

  messages: (gameId: string, params?: { before?: number; limit?: number }) =>
    client
      .get<GetMessagesResponse | { data: GetMessagesResponse }>(
        endpoints.game.messages(gameId),
        { params }
      )
      .then((res) => unwrapData<GetMessagesResponse>(res)),

  sendMessage: (gameId: string, payload: SendMessageRequest) =>
    client.post<SendMessageResponse>(endpoints.game.send(gameId), payload),

  move: (gameId: string, payload: MoveRequest) =>
    client.post<MoveResponse>(endpoints.game.move(gameId), payload),

  getFriendsForNewGame: () =>
    client
      .get<{ data: GetNewGameResponse }>(endpoints.game.new)
      .then((res) => res.data),

  create: (opponent: string) =>
    client.post<CreateGameResponse>(endpoints.game.create, { opponent }),

  resign: (gameId: string) =>
    client.post<ResignResponse>(endpoints.game.resign(gameId)),

  drawOffer: (gameId: string) =>
    client.post<DrawOfferResponse>(endpoints.game.drawOffer(gameId)),

  drawAccept: (gameId: string) =>
    client.post<DrawOfferResponse>(endpoints.game.drawAccept(gameId)),

  drawDecline: (gameId: string) =>
    client.post<DrawOfferResponse>(endpoints.game.drawDecline(gameId)),

  delete: (gameId: string) =>
    client.post<DeleteResponse>(endpoints.game.delete(gameId)),

  checkSubscription: () =>
    client
      .get<{ data: { exists: boolean } } | { exists: boolean }>('/-/notifications/check')
      .then((res) => unwrapData<{ exists: boolean }>(res)),
}
