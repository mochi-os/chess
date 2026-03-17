import { createFileRoute } from '@tanstack/react-router'
import { ForbiddenError } from '@mochi/web'

export const Route = createFileRoute('/(errors)/403')({
  component: ForbiddenError,
})
