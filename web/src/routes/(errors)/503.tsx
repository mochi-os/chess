import { createFileRoute } from '@tanstack/react-router'
import { MaintenanceError } from '@mochi/web'

export const Route = createFileRoute('/(errors)/503')({
  component: MaintenanceError,
})
