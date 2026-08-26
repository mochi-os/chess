// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { createAppClient } from '@mochi/web'
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
      .get<{ data: Game[] } | Game[]>(endpoints.game.list)
      .then((res) => ({ games: unwrapData<Game[]>(res) })),

  detail: (gameId: string) =>
    client
      .get<GameViewResponse | { data: GameViewResponse }>(
        endpoints.game.detail(gameId)
      )
      .then((res) => unwrapData<GameViewResponse>(res)),

  messages: (gameId: string, params?: { before?: string; limit?: number }) =>
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
    client
      .post<CreateGameResponse | { data: CreateGameResponse }>(endpoints.game.create, { opponent })
      .then((res) => unwrapData<CreateGameResponse>(res)),

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
}
