import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { useAuthStore, isInShell, ThemeProvider, createQueryClient, getRouterBasepath } from '@mochi/common'
import { WebsocketProvider } from './context/websocket-provider'
// Generated Routes
import { routeTree } from './routeTree.gen'
// Styles
import './styles/index.css'

const queryClient = createQueryClient()

const router = createRouter({
  routeTree,
  context: { queryClient },
  basepath: getRouterBasepath(),
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
})

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Initialize auth state from cookie on app start BEFORE router loads
// In shell mode, auth is initialized asynchronously via postMessage in _authenticated/route.tsx
if (!isInShell()) {
  useAuthStore.getState().initialize()
}

// Render the app
const rootElement = document.getElementById('root')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <WebsocketProvider>
            <RouterProvider router={router} />
          </WebsocketProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </StrictMode>
  )
}
