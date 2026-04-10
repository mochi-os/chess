import { useEffect, useMemo } from 'react'
import { Outlet, useParams } from '@tanstack/react-router'
import {
  cn,
  useSidebar,
  useAuthStore,
  AuthenticatedLayout,
  type SidebarData,
} from '@mochi/web'
import { Plus } from 'lucide-react'
import { SidebarProvider, useSidebarContext } from '@/context/sidebar-context'
import { useGamesQuery } from '@/hooks/useGames'
import { NewGame } from '@/features/chess/components/new-game'
import { getOpponentName, type Game } from '@/api/games'

function WebsocketStatusIndicator() {
  const { websocketStatusMeta, gameId } = useSidebarContext()
  const { state } = useSidebar()
  const isCollapsed = state === 'collapsed'

  if (!gameId) return null

  return (
    <div
      className={cn(
        'text-muted-foreground flex items-center gap-2 px-2 py-2 text-xs',
        isCollapsed && 'justify-center px-0'
      )}
    >
      <span
        className={cn(
          'h-2 w-2 flex-shrink-0 rounded-full',
          websocketStatusMeta.color
        )}
      />
      {!isCollapsed && <span>{websocketStatusMeta.label}</span>}
    </div>
  )
}

function ChessLayoutInner() {
  const gamesQuery = useGamesQuery()
  const games = useMemo(
    () => gamesQuery.data?.games ?? [],
    [gamesQuery.data?.games]
  )
  const { setGame, openNewGameDialog } = useSidebarContext()
  const { identity: myIdentity } = useAuthStore()

  const params = useParams({ strict: false }) as { gameId?: string }
  const urlGameId = params?.gameId

  useEffect(() => {
    if (urlGameId) {
      const game = games.find(
        (g) => g.id === urlGameId || g.fingerprint === urlGameId
      )
      const name = game && myIdentity
        ? getOpponentName(game, myIdentity)
        : undefined
      setGame(urlGameId, name)
    } else {
      setGame(null)
    }
  }, [urlGameId, games, myIdentity, setGame])

  const sidebarData: SidebarData = useMemo(() => {
    const sortedGames = [...games].sort((a, b) => b.updated - a.updated)
    const activeGames = sortedGames.filter((g) => g.status === 'active')
    const completedGames = sortedGames.filter((g) => g.status !== 'active')

    const getName = (game: Game) =>
      myIdentity ? getOpponentName(game, myIdentity) : game.opponent_name

    const groups: SidebarData['navGroups'] = []

    if (activeGames.length > 0) {
      groups.push({
        title: 'Active Games',
        items: activeGames.map((game) => ({
          title: getName(game),
          url: `/${game.fingerprint ?? game.id}`,
        })),
      })
    }

    if (completedGames.length > 0) {
      groups.push({
        title: 'Completed',
        items: completedGames.map((game) => ({
          title: `${getName(game)} (${game.status})`,
          url: `/${game.fingerprint ?? game.id}`,
        })),
      })
    }

    groups.push({
      title: '',
      separator: true,
      items: [
        {
          title: 'New game',
          onClick: openNewGameDialog,
          icon: Plus,
        },
      ],
    })

    return { navGroups: groups }
  }, [games, myIdentity, openNewGameDialog])

  return (
    <AuthenticatedLayout
      sidebarData={sidebarData}
      sidebarFooter={<WebsocketStatusIndicator />}
    >
      <Outlet />
    </AuthenticatedLayout>
  )
}

export function ChessLayout() {
  return (
    <SidebarProvider>
      <ChessLayoutInner />
      <NewGame />
    </SidebarProvider>
  )
}
