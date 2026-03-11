import { Chess } from 'chess.js'
import {
  CAPTURED_PIECE_ORDER,
  type CapturedPieceType,
} from './chess-pieces'

export interface CapturedPieceCount {
  type: CapturedPieceType
  count: number
}

export interface CapturedPiecesSummary {
  capturedByWhite: CapturedPieceCount[]
  capturedByBlack: CapturedPieceCount[]
}

function createEmptyCaptureCounts(): Record<CapturedPieceType, number> {
  return {
    p: 0,
    n: 0,
    b: 0,
    r: 0,
    q: 0,
  }
}

function toCapturedPieceList(
  counts: Record<CapturedPieceType, number>
): CapturedPieceCount[] {
  return CAPTURED_PIECE_ORDER.flatMap((type) =>
    counts[type] > 0 ? [{ type, count: counts[type] }] : []
  )
}

function isCapturedPieceType(type: string): type is CapturedPieceType {
  return CAPTURED_PIECE_ORDER.includes(type as CapturedPieceType)
}

export function getCapturedPiecesSummary(
  moveHistory: readonly string[]
): CapturedPiecesSummary {
  if (moveHistory.length === 0) {
    return {
      capturedByWhite: [],
      capturedByBlack: [],
    }
  }

  const chess = new Chess()
  const capturedByWhiteCounts = createEmptyCaptureCounts()
  const capturedByBlackCounts = createEmptyCaptureCounts()

  for (const san of moveHistory) {
    const normalizedSan = san.trim()
    if (!normalizedSan) {
      continue
    }

    let move
    try {
      move = chess.move(normalizedSan)
    } catch {
      break
    }

    if (!move?.captured || !isCapturedPieceType(move.captured)) {
      continue
    }

    if (move.color === 'w') {
      capturedByWhiteCounts[move.captured] += 1
      continue
    }

    capturedByBlackCounts[move.captured] += 1
  }

  return {
    capturedByWhite: toCapturedPieceList(capturedByWhiteCounts),
    capturedByBlack: toCapturedPieceList(capturedByBlackCounts),
  }
}
