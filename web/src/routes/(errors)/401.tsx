import { createFileRoute } from '@tanstack/react-router'
import { UnauthorisedError } from '@mochi/common'

export const Route = createFileRoute('/(errors)/401')({
  component: UnauthorisedError,
})
