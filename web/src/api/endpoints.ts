// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

const endpoints = {
  game: {
    list: '/-/list',
    new: '/-/new',
    create: '/-/create',
    detail: (gameId: string) => `/${gameId}/-/view`,
    messages: (gameId: string) => `/${gameId}/-/messages`,
    send: (gameId: string) => `/${gameId}/-/send`,
    move: (gameId: string) => `/${gameId}/-/move`,
    resign: (gameId: string) => `/${gameId}/-/resign`,
    drawOffer: (gameId: string) => `/${gameId}/-/draw-offer`,
    drawAccept: (gameId: string) => `/${gameId}/-/draw-accept`,
    drawDecline: (gameId: string) => `/${gameId}/-/draw-decline`,
    delete: (gameId: string) => `/${gameId}/-/delete`,
  },
  auth: {
    code: '/_/code',
    verify: '/_/verify',
    identity: '/_/identity',
    logout: '/_/logout',
  },
} as const

export default endpoints
