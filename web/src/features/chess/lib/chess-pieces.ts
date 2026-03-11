export const CHESS_PIECE_NAMES = {
  k: 'king',
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
} as const

export const CAPTURED_PIECE_ORDER = ['p', 'n', 'b', 'r', 'q'] as const

export type ChessPieceType = keyof typeof CHESS_PIECE_NAMES
export type CapturedPieceType = typeof CAPTURED_PIECE_ORDER[number]

export function getPieceImagePath(
  color: 'w' | 'b',
  type: ChessPieceType
): string {
  const side = color === 'w' ? 'white' : 'black'
  return `images/pieces/${side}/${CHESS_PIECE_NAMES[type]}.svg`
}
