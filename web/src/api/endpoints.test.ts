// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
// A game id comes from the route or from the opponent's server, so each
// builder keeps it in one path segment: an id holding `../delete`, a query or
// a slash would otherwise aim the request at another action.
import { describe, expect, it, vi } from 'vitest'
import endpoints from './endpoints'

// The path helper itself, without the rest of the library, which needs a DOM.
vi.mock(
  '@mochi/web',
  async () => await import('@mochi/web/lib/request-path.ts')
)

const GAME = '0193a1b2c3d4e5f60718293a4b5c6d7e'
const REFUSED = ['../delete', 'a/b', '.', '..', '']

describe('game endpoints', () => {
  const builders = {
    detail: [endpoints.game.detail, `/${GAME}/-/view`],
    move: [endpoints.game.move, `/${GAME}/-/move`],
    resign: [endpoints.game.resign, `/${GAME}/-/resign`],
    drawAccept: [endpoints.game.drawAccept, `/${GAME}/-/draw-accept`],
    delete: [endpoints.game.delete, `/${GAME}/-/delete`],
  } as const

  it.each(Object.entries(builders))('%s keeps a game id as is', (_, entry) => {
    const [build, expected] = entry
    expect(build(GAME)).toBe(expected)
  })

  it.each(Object.entries(builders))('%s refuses a hostile id', (_, entry) => {
    const [build] = entry
    for (const id of REFUSED) expect(() => build(id)).toThrow()
  })

  it('encodes a query in an id into the one segment', () => {
    expect(endpoints.game.resign('x?y=1')).toBe('/x%3Fy%3D1/-/resign')
  })

  // The player's id is their server's, so it is refused or encoded like the
  // game's; the page leaves the avatar out when it is refused.
  it("keeps a player's asset under the game", () => {
    const USER = '1sfEACmTnQhBVgquGhaCs8Jw4SXKF9XY2apnUwJ63duq2QSxh5'
    expect(endpoints.game.asset(GAME, USER, 'avatar')).toBe(
      `/${GAME}/-/user/${USER}/asset/avatar`
    )
    for (const id of REFUSED) {
      expect(() => endpoints.game.asset(GAME, id, 'style')).toThrow()
      expect(() => endpoints.game.asset(id, USER, 'style')).toThrow()
    }
    expect(endpoints.game.asset(GAME, 'x?y=1', 'avatar')).toBe(
      `/${GAME}/-/user/x%3Fy%3D1/asset/avatar`
    )
  })
})
