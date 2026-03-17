import { createFileRoute } from '@tanstack/react-router'
import { NotFoundError } from '@mochi/web'

export const Route = createFileRoute('/(errors)/404')({
  component: NotFoundError,
})
