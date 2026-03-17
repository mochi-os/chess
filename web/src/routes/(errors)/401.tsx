import { createFileRoute } from '@tanstack/react-router'
import { UnauthorisedError } from '@mochi/web'

export const Route = createFileRoute('/(errors)/401')({
  component: UnauthorisedError,
})
