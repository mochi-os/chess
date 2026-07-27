// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useEffect, useMemo } from 'react'
import { useLingui } from '@lingui/react/macro'
import { Outlet, useParams } from '@tanstack/react-router'
import {
  cn,
  useSidebar,
  useAuthStore,
  AuthenticatedLayout,
  EntityAvatar,
  type SidebarData,
} from '@mochi/web'
import { Plus } from 'lucide-react'
import { SidebarProvider, useSidebarContext } from '@/context/sidebar-context'
import { useGamesQuery } from '@/hooks/useGames'
import { NewGame } from '@/features/chess/components/new-game'
import { getOpponentName, type Game } from '@/api/games'

const opponentIconCache = new Map<string, React.FC>()

function opponentIcon(gameId: string, opponentId: string): React.FC {
  // Served by this app's own asset proxy, never by a direct /people/ fetch:
  // inside the shell iframe a cross-app request goes out anonymous, and for a
  // remote opponent there is no local /people/ entity at all - the proxy
  // resolves them over P2P.
  const cacheKey = `${gameId}:${opponentId}`
  let Icon = opponentIconCache.get(cacheKey)
  if (!Icon) {
    Icon = function OpponentIcon() {
      return (
        <EntityAvatar
          src={`/chess/${gameId}/-/user/${opponentId}/asset/avatar`}
          styleUrl={`/chess/${gameId}/-/user/${opponentId}/asset/style`}
          size="xs"
        />
      )
    }
    // eslint-disable-next-line lingui/no-unlocalized-strings -- React displayName is dev-tooling only, not user-facing
    Icon.displayName = `OpponentIcon(${opponentId})`
    opponentIconCache.set(cacheKey, Icon)
  }
  return Icon
}

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
  const { t } = useLingui()
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
      setGame(urlGameId)
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

    const getOpponentId = (game: Game) =>
      myIdentity && game.identity === myIdentity ? game.opponent : game.identity

    const groups: SidebarData['navGroups'] = []

    if (activeGames.length > 0) {
      groups.push({
        title: t`Active games`,
        items: activeGames.map((game) => ({
          title: getName(game),
          url: `/${game.id}`,
          icon: opponentIcon(game.id, getOpponentId(game)),
        })),
      })
    }

    if (completedGames.length > 0) {
      groups.push({
        title: t`Completed`,
        items: completedGames.map((game) => ({
          // Styled like words' completed entries rather than printing the raw
          // untranslated status enum after the name.
          title: getName(game),
          url: `/${game.id}`,
          icon: opponentIcon(game.id, getOpponentId(game)),
          className: 'text-muted-foreground',
        })),
      })
    }

    groups.push({
      title: '',
      separator: true,
      items: [
        {
          title: t`New game`,
          onClick: openNewGameDialog,
          icon: Plus,
        },
      ],
    })

    return { navGroups: groups }
  }, [games, myIdentity, openNewGameDialog, t])

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
