import { createFileRoute } from '@tanstack/react-router'
import { NotFoundError } from '@mochi/common'

export const Route = createFileRoute('/(errors)/404')({
  component: NotFoundError,
})
