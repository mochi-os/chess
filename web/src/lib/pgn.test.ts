// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { Chess } from 'chess.js'
import { describe, it, expect } from 'vitest'
import { lastMove, resume } from './pgn'

// A three-move opening, and the position it reaches. Built rather than pasted
// so the FEN cannot drift from the moves it is supposed to describe.
function opening(): { fen: string; pgn: string } {
  const built = new Chess()
  built.move('e4')
  built.move('e5')
  built.move('Nf3')
  return { fen: built.fen(), pgn: built.pgn() }
}

describe('resume', () => {
  it('extends the game score rather than replacing it', () => {
    const { fen, pgn } = opening()
    const game = resume(fen, pgn)
    game.move('Nc6')
    // The record must still contain the opening, not just the move made now.
    expect(game.pgn()).toContain('e4')
    expect(game.pgn()).toContain('Nf3')
    expect(game.history()).toEqual(['e4', 'e5', 'Nf3', 'Nc6'])
  })

  it('reaches the stored position when it replays the PGN', () => {
    const { fen, pgn } = opening()
    expect(resume(fen, pgn).fen()).toBe(fen)
  })

  it('falls back to the position when the PGN is a truncated record', () => {
    // What the pre-fix client wrote: the last move only, so replaying it
    // reaches a different position than the FEN describes. Playing on from the
    // wrong board would be worse than losing the history.
    const { fen } = opening()
    const truncated = new Chess()
    truncated.move('d4')
    const game = resume(fen, truncated.pgn())
    expect(game.fen()).toBe(fen)
    expect(game.history()).toEqual([])
  })

  it('falls back to the position when the PGN is malformed', () => {
    const { fen } = opening()
    const game = resume(fen, 'not a pgn at all {{{')
    expect(game.fen()).toBe(fen)
  })

  it('falls back to the position when there is no PGN', () => {
    const { fen } = opening()
    expect(resume(fen, '').fen()).toBe(fen)
  })

  it('starts a fresh game from the opening position', () => {
    const fresh = new Chess().fen()
    const game = resume(fresh, '')
    game.move('e4')
    expect(game.history()).toEqual(['e4'])
  })
})

describe('lastMove', () => {
  it('gives the squares of the last move in the record', () => {
    const { fen, pgn } = opening()
    expect(lastMove(fen, pgn)).toEqual({ from: 'g1', to: 'f3' })
  })

  it("gives the opponent's move as readily as the player's own", () => {
    // Black's reply is the last move here. Nothing in the answer depends on
    // who is looking at the board.
    const built = new Chess()
    built.move('e4')
    built.move('e5')
    expect(lastMove(built.fen(), built.pgn())).toEqual({ from: 'e7', to: 'e5' })
  })

  it('gives nothing before the first move', () => {
    const fresh = new Chess()
    expect(lastMove(fresh.fen(), '')).toBeNull()
    expect(lastMove(fresh.fen(), fresh.pgn())).toBeNull()
  })

  it('gives nothing when the record is not this position', () => {
    const { fen } = opening()
    const other = new Chess()
    other.move('d4')
    expect(lastMove(fen, other.pgn())).toBeNull()
  })

  it('gives nothing for a corrupt position rather than throwing', () => {
    expect(lastMove('not a fen', '')).toBeNull()
  })
})
