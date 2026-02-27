import { createFileRoute } from '@tanstack/react-router'
import { useAuthStore, getCookie } from '@mochi/common'
import { ChessLayout } from '@/components/layout/chess-layout'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ location }) => {
    const store = useAuthStore.getState()

    if (!store.isInitialized) {
      store.initialize()
    }

    const token = getCookie('token') || store.token

    if (!token) {
      const returnUrl = encodeURIComponent(location.href)
      const redirectUrl = `${import.meta.env.VITE_AUTH_LOGIN_URL}?redirect=${returnUrl}`

      window.location.href = redirectUrl
      return
    }

    return
  },
  component: ChessLayout,
})
