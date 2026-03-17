import { createFileRoute } from '@tanstack/react-router'
import { GeneralError } from '@mochi/web'

export const Route = createFileRoute('/(errors)/500')({
  component: GeneralError,
})
