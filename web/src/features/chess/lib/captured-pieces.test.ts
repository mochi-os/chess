// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { Chess } from 'chess.js'
import { describe, it, expect } from 'vitest'
import { getCapturedPiecesSummary } from './captured-pieces'

function played(moves: string[], start?: string): { fen: string; pgn: string } {
  const chess = new Chess(start)
  for (const move of moves) chess.move(move)
  return { fen: chess.fen(), pgn: chess.pgn() }
}

describe('getCapturedPiecesSummary', () => {
  it('counts what each side took', () => {
    const { fen, pgn } = played(['e4', 'd5', 'exd5', 'Qxd5'])
    expect(getCapturedPiecesSummary(fen, pgn)).toEqual({
      capturedByWhite: [{ type: 'p', count: 1 }],
      capturedByBlack: [{ type: 'p', count: 1 }],
    })
  })

  it('does not count a promoted pawn as taken', () => {
    // White takes three pawns and a rook; its e-pawn becomes a queen, which
    // Black never took.
    const { fen, pgn } = played([
      'e4',
      'd5',
      'exd5',
      'c6',
      'dxc6',
      'Nf6',
      'cxb7',
      'Nbd7',
      'bxa8=Q',
    ])
    expect(getCapturedPiecesSummary(fen, pgn)).toEqual({
      capturedByWhite: [
        { type: 'p', count: 3 },
        { type: 'r', count: 1 },
      ],
      capturedByBlack: [],
    })
  })

  it('counts a capture en passant', () => {
    const { fen, pgn } = played(['e4', 'a6', 'e5', 'd5', 'exd6'])
    expect(getCapturedPiecesSummary(fen, pgn).capturedByWhite).toEqual([
      { type: 'p', count: 1 },
    ])
  })

  it('counts from the position when the record is lost', () => {
    // A record that does not replay to the position: the position alone, with
    // a surplus queen read as a promoted pawn rather than a pawn taken.
    const fen = '4k3/8/8/8/8/8/8/QQ2K3 w - - 0 1'
    const summary = getCapturedPiecesSummary(fen, '1. d4 d5')
    expect(summary.capturedByBlack).toEqual([
      { type: 'p', count: 7 },
      { type: 'n', count: 2 },
      { type: 'b', count: 2 },
      { type: 'r', count: 2 },
    ])
  })

  it('adds the moves to what a record starting from a position lacked', () => {
    const start = '4k3/8/8/8/8/8/3p4/R3K3 w - - 0 1'
    const { fen, pgn } = played(['Kxd2'], start)
    const summary = getCapturedPiecesSummary(fen, pgn)
    expect(summary.capturedByWhite).toEqual([
      { type: 'p', count: 8 },
      { type: 'n', count: 2 },
      { type: 'b', count: 2 },
      { type: 'r', count: 2 },
      { type: 'q', count: 1 },
    ])
  })
})
