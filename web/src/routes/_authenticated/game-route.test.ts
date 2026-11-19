// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
// The view requests `/<gameId>/-/<action>` the moment it mounts, and the
// router hands it the parameter percent-decoded, so a link such as
// `/chess/<game>%2F%252D%2Fresign%3F` resigned the game of whoever followed
// it. The route answers not-found for a parameter that is not a game id,
// before anything loads. The suite has no DOM, so the route is loaded by a
// router rather than rendered; lib/web's own tests render the guard.
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { describe, expect, it, vi } from 'vitest'
import { Route } from './$gameId'

// The guard itself, without the rest of the library, which needs a DOM.
vi.mock('@mochi/web', async () => await import('@mochi/web/lib/game-route.ts'))
vi.mock('@/features/chess', () => ({ ChessGame: () => null }))

const GAME = '0193a1b2c3d4e5f60718293a4b5c6d7e'

// The status the router settles on for an address, the route's own options
// standing in for the app's, and whether its loader ran.
async function open(address: string) {
  const loader = vi.fn(() => null)
  const root = createRootRoute()
  const game = createRoute({
    getParentRoute: () => root,
    path: '$gameId',
    params: (Route.options as { params?: unknown }).params as never,
    loader,
  })
  const router = createRouter({
    routeTree: root.addChildren([game]),
    history: createMemoryHistory({ initialEntries: [address] }),
  })
  await router.load()
  return { status: router.state.statusCode, loaded: loader.mock.calls.length }
}

describe('game route', () => {
  it.each([
    ['a climb to resign', `/${GAME}%2F%252D%2Fresign%3F`],
    ['a climb to move with inputs', `/${GAME}%2F%252D%2Fmove%3Fwinner%3Dx`],
    ['an action name', '/delete'],
    ['a short id', `/${GAME.slice(1)}`],
  ])(
    'answers not-found for %s, with nothing loaded',
    async (_name, address) => {
      expect(await open(address)).toEqual({ status: 404, loaded: 0 })
    }
  )

  // CONTROL: a game id loads.
  it('loads a game id', async () => {
    expect(await open(`/${GAME}`)).toEqual({ status: 200, loaded: 1 })
  })
})
