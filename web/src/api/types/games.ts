// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

export interface Game {
  id: string
  fingerprint?: string
  identity: string
  identity_name: string
  opponent: string
  opponent_name: string
  white: string
  status: 'active' | 'checkmate' | 'stalemate' | 'draw' | 'resigned'
  winner: string | null
  draw_offer: string | null
  fen: string
  pgn: string
  key: string
  updated: number
  created: number
}

export function getOpponentName(game: Game, myIdentity: string): string {
  return game.identity === myIdentity ? game.opponent_name : game.identity_name
}

export type MessageType = 'message' | 'move' | 'system'

export interface GameMessage {
  id: string
  game: string
  member: string
  name: string
  body: string
  type: MessageType
  // For type 'system': the event kind (resign / draw_offer / draw_accept /
  // draw_decline), used to render localised text. Empty/absent on legacy
  // rows, which fall back to `body`.
  event?: string
  created: number
}

export interface GameViewResponse {
  game: Game
  identity: string
}

export interface GetGamesResponse {
  games: Game[]
}

export interface GetMessagesResponse {
  messages: GameMessage[]
  hasMore?: boolean
  nextCursor?: number
}

export interface CreateGameResponse {
  id: string
  white: string
}

export interface NewGameFriend {
  class: string
  id: string
  identity: string
  name: string
}

export interface GetNewGameResponse {
  friends: NewGameFriend[]
}

export interface SendMessageRequest {
  body: string
}

export interface SendMessageResponse {
  id: string
}

export interface MoveRequest {
  from: string
  to: string
  promotion?: string
  fen: string
  pgn: string
  san: string
  status?: string
  winner?: string
}

export interface MoveResponse {
  id: string
}

export interface ResignResponse {
  success: boolean
}

export interface DeleteResponse {
  success: boolean
}

export interface DrawOfferResponse {
  success: boolean
}
