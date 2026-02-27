import { createFileRoute } from '@tanstack/react-router'
import { ChessGame } from '@/features/chess'

export const Route = createFileRoute('/_authenticated/$gameId')({
  component: ChessGame,
})
