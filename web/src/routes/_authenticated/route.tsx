import { createFileRoute } from '@tanstack/react-router'
import { useAuthStore, isInShell } from '@mochi/common'
import { ChessLayout } from '@/components/layout/chess-layout'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    const store = useAuthStore.getState()

    if (!store.isInitialized) {
      if (isInShell()) {
        await store.initializeFromShell()
      } else {
        store.initialize()
      }
    }

    if (!isInShell() && !store.token) {
      const returnUrl = encodeURIComponent(location.href)
      const redirectUrl = `${import.meta.env.VITE_AUTH_LOGIN_URL}?redirect=${returnUrl}`
      window.location.href = redirectUrl
      return
    }
  },
  component: ChessLayout,
})
