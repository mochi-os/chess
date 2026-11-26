// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { Chess, DEFAULT_POSITION } from 'chess.js'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { lastMove, resume } from './pgn'

// The record both clients write, generated with chess.js. The Android client's
// NotationTest reads a byte-identical copy and must write every ply's FEN and
// PGN exactly as recorded here, so the two clients cannot drift apart again.
// Regenerate both copies with `CHESS_FIXTURE=write pnpm test` after changing a
// game below or upgrading chess.js.
const fixturePath = fileURLToPath(new URL('./notation.json', import.meta.url))
const androidPath = fileURLToPath(
  new URL(
    '../../../../../clients/android/apps/chess/src/test/resources/notation.json',
    import.meta.url
  )
)

interface Game {
  name: string
  start?: string
  moves: string[]
}

const games: Game[] = [
  {
    // After 1. e4 no black pawn can take en passant, so no square is written;
    // after 2... f5 the pawn on e5 can.
    name: 'en passant',
    moves: ['e4', 'd5', 'e5', 'f5', 'exf6', 'Nxf6'],
  },
  {
    // Taking en passant would open the rank to the king, so the square is
    // not written; Black moves first, so the record numbers "1. ... c5".
    name: 'pinned en passant',
    start: '8/2p5/8/KP5r/8/8/8/7k b - - 0 1',
    moves: ['c5', 'Ka4', 'Kg2', 'b6'],
  },
  {
    // White's e-pawn becomes a queen, so material counting would credit
    // Black with a pawn it never took.
    name: 'promotion',
    moves: [
      'e4',
      'd5',
      'exd5',
      'c6',
      'dxc6',
      'Nf6',
      'cxb7',
      'Nbd7',
      'bxa8=Q',
      'Qc7',
      'Qxa7',
      'Qxc2',
    ],
  },
  {
    name: 'underpromotion and check',
    start: '4k3/P7/8/8/8/8/7p/4K3 w - - 0 1',
    moves: ['a8=N', 'h1=Q+', 'Ke2'],
  },
  {
    // The opening position comes round a third time with the last move.
    name: 'repetition',
    moves: ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8'],
  },
  {
    name: 'disambiguation and castling',
    moves: [
      'Nf3',
      'Nf6',
      'd4',
      'd5',
      'Nbd2',
      'Nbd7',
      'e3',
      'e6',
      'Bd3',
      'Bd6',
      'O-O',
      'O-O',
    ],
  },
  {
    name: 'queenside castling',
    moves: [
      'd4',
      'd5',
      'Nc3',
      'Nc6',
      'Bf4',
      'Bf5',
      'Qd2',
      'Qd7',
      'O-O-O',
      'O-O-O',
    ],
  },
  {
    // The knight on c6 is pinned, so only one knight can reach e7 and the
    // move needs no file: "Ne7", not "Nge7".
    name: 'pinned twin',
    start: 'r1bqkbnr/ppp2ppp/2n5/1B1pP3/4P3/8/PPPP2PP/RNBQK1NR b KQkq - 2 4',
    moves: ['Ne7', 'Nf3'],
  },
  {
    name: 'checkmate',
    moves: ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#'],
  },
]

interface Ply {
  from: string
  to: string
  promotion: string | null
  san: string
  captured: string | null
  fen: string
  pgn: string
  repetition: boolean
}

interface Fixture {
  games: {
    name: string
    start: string
    empty: string
    plies: Ply[]
  }[]
}

function generate(): Fixture {
  return {
    games: games.map((game) => {
      const start = game.start ?? DEFAULT_POSITION
      const chess = new Chess(start)
      const empty = chess.pgn()
      const plies = game.moves.map((san): Ply => {
        const move = chess.move(san)
        return {
          from: move.from,
          to: move.to,
          promotion: move.promotion ?? null,
          san: move.san,
          captured: move.captured ?? null,
          fen: chess.fen(),
          pgn: chess.pgn(),
          repetition: chess.isThreefoldRepetition(),
        }
      })
      return { name: game.name, start, empty, plies }
    }),
  }
}

const generated = JSON.stringify(generate(), null, 2) + '\n'
if (process.env.CHESS_FIXTURE === 'write') {
  writeFileSync(fixturePath, generated)
  if (existsSync(androidPath)) writeFileSync(androidPath, generated)
}
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as Fixture

/** The record the Android client wrote before it wrote chess.js's: moves only. */
function tagless(plies: Ply[]): string {
  return plies
    .map((ply, index) =>
      index % 2 === 0 ? `${index / 2 + 1}. ${ply.san}` : ply.san
    )
    .join(' ')
}

describe('the notation fixture', () => {
  it('is what chess.js writes', () => {
    expect(readFileSync(fixturePath, 'utf8')).toBe(generated)
  })

  it.skipIf(!existsSync(androidPath))(
    'is the copy the Android client reads',
    () => {
      expect(readFileSync(androidPath, 'utf8')).toBe(generated)
    }
  )

  for (const game of fixture.games) {
    it(`resumes every ply of "${game.name}" with its whole history`, () => {
      game.plies.forEach((ply, index) => {
        const resumed = resume(ply.fen, ply.pgn)
        expect(resumed.history().length).toBe(index + 1)
        expect(lastMove(ply.fen, ply.pgn)).toEqual({
          from: ply.from,
          to: ply.to,
        })
      })
    })
  }

  it("resumes the Android client's old records", () => {
    const opening = fixture.games.find((game) => game.name === 'en passant')!
    opening.plies.forEach((ply, index) => {
      const plies = opening.plies.slice(0, index + 1)
      // Its FEN wrote the en passant square after every two-square pawn move.
      const fen = index === 0 ? ply.fen.replace(' - ', ' e3 ') : ply.fen
      expect(resume(fen, tagless(plies)).history().length).toBe(index + 1)
    })
    // Its move appended after chess.js's result marker.
    const [first, second] = opening.plies
    const appended = `${first.pgn} ${second.san}`
    expect(resume(second.fen, appended).history()).toEqual([
      first.san,
      second.san,
    ])
  })
})

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
