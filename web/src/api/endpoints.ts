// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { path } from '@mochi/web'

const endpoints = {
  game: {
    list: '/-/list',
    new: '/-/new',
    create: '/-/create',
    detail: (gameId: string) => path`/${gameId}/-/view`,
    messages: (gameId: string) => path`/${gameId}/-/messages`,
    send: (gameId: string) => path`/${gameId}/-/send`,
    move: (gameId: string) => path`/${gameId}/-/move`,
    resign: (gameId: string) => path`/${gameId}/-/resign`,
    drawOffer: (gameId: string) => path`/${gameId}/-/draw-offer`,
    drawAccept: (gameId: string) => path`/${gameId}/-/draw-accept`,
    drawDecline: (gameId: string) => path`/${gameId}/-/draw-decline`,
    delete: (gameId: string) => path`/${gameId}/-/delete`,
    // A player's avatar or style, through the game it is bound to.
    asset: (gameId: string, user: string, slot: 'avatar' | 'style') =>
      path`/${gameId}/-/user/${user}/asset/${slot}`,
  },
} as const

export default endpoints
