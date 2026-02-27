import { createFileRoute } from '@tanstack/react-router'
import { ForbiddenError } from '@mochi/common'

export const Route = createFileRoute('/(errors)/403')({
  component: ForbiddenError,
})
