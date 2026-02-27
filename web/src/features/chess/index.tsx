import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { Chess } from 'chess.js'
import {
  useAuthStore,
  usePageTitle,
  PageHeader,
  Main,
  GeneralError,
  Button,
  getErrorMessage,
  toast,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Skeleton,
} from '@mochi/common'
import { MoreHorizontal, Trash2, Loader2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@mochi/common'
import { useSidebarContext } from '@/context/sidebar-context'
import { setLastGame } from '@/hooks/useGameStorage'
import { useGameWebsocket } from '@/hooks/useGameWebsocket'
import {
  useInfiniteMessagesQuery,
  useGamesQuery,
  useSendMessageMutation,
  useGameDetailQuery,
  useMoveMutation,
  useResignMutation,
  useDeleteGameMutation,
} from '@/hooks/useGames'
import { GameEmptyState } from './components/game-empty-state'
import { ChessBoard } from './components/chess-board'
import { GameStatus } from './components/game-status'
import { ChatMessageList } from './components/chat-message-list'
import { ChatInput } from './components/chat-input'

export function ChessGame() {
  usePageTitle('Chess')

  const navigate = useNavigate()
  const { openNewGameDialog, setWebsocketStatus } = useSidebarContext()
  const [newMessage, setNewMessage] = useState('')
  const [showResignDialog, setShowResignDialog] = useState(false)
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null)

  const {
    identity: currentUserIdentity,
    initialize: initializeAuth,
  } = useAuthStore()

  useEffect(() => {
    initializeAuth()
  }, [initializeAuth])

  const params = useParams({ strict: false }) as { gameId?: string }
  const selectedGameId = params?.gameId

  useEffect(() => {
    if (selectedGameId) {
      setLastGame(selectedGameId)
    }
  }, [selectedGameId])

  // Games list
  const gamesQuery = useGamesQuery()
  const games = useMemo(
    () => gamesQuery.data?.games ?? [],
    [gamesQuery.data?.games]
  )

  const selectedGame = useMemo(
    () =>
      games.find(
        (g) => g.id === selectedGameId || g.fingerprint === selectedGameId
      ) ?? null,
    [games, selectedGameId]
  )

  // Game detail
  const { data: gameDetail, isLoading: isLoadingDetail } = useGameDetailQuery(selectedGame?.id)

  const game = gameDetail?.game
  const myIdentity = gameDetail?.identity ?? currentUserIdentity

  // Chess state from game detail FEN
  const chess = useMemo(() => {
    if (!game?.fen) return null
    const c = new Chess()
    c.load(game.fen)
    return c
  }, [game?.fen])

  const myColor = game && myIdentity ? (game.white === myIdentity ? 'w' : 'b') : 'w'
  const isMyTurn = chess ? chess.turn() === myColor : false
  const isCheck = chess ? chess.isCheck() : false

  // Messages
  const messagesQuery = useInfiniteMessagesQuery(selectedGame?.id)
  const chatMessages = useMemo(() => {
    if (!messagesQuery.data?.pages) return []
    return [...messagesQuery.data.pages].reverse().flatMap((p) => p.messages)
  }, [messagesQuery.data?.pages])

  // Send message
  const sendMessageMutation = useSendMessageMutation({
    onSuccess: () => {
      setNewMessage('')
    },
  })

  // Move
  const moveMutation = useMoveMutation()

  // Resign
  const resignMutation = useResignMutation({
    onSuccess: () => {
      setShowResignDialog(false)
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to resign'))
    },
  })

  // Delete
  const deleteGameMutation = useDeleteGameMutation({
    onSuccess: () => {
      toast.success('Game deleted')
      void navigate({ to: '/' })
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to delete game'))
    },
  })

  // WebSocket
  const { status, retries } = useGameWebsocket(
    selectedGame?.id,
    selectedGame?.key
  )
  useEffect(() => {
    setWebsocketStatus(status, retries)
  }, [status, retries, setWebsocketStatus])

  const handleMove = useCallback(
    (from: string, to: string, promotion?: string) => {
      if (!game || !selectedGame) return

      // Use a fresh chess instance to validate the move
      const c = new Chess()
      c.load(game.fen)
      const move = c.move({ from, to, promotion })
      if (!move) return

      setLastMove({ from, to })

      let moveStatus = ''
      let winner = ''
      if (c.isCheckmate()) {
        moveStatus = 'checkmate'
        winner = myIdentity
      } else if (c.isStalemate()) {
        moveStatus = 'stalemate'
      } else if (c.isDraw()) {
        moveStatus = 'draw'
      }

      moveMutation.mutate({
        gameId: selectedGame.id,
        from,
        to,
        promotion,
        fen: c.fen(),
        pgn: c.pgn(),
        san: move.san,
        status: moveStatus || undefined,
        winner: winner || undefined,
      })
    },
    [game, selectedGame, myIdentity, moveMutation]
  )

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedGame) return
    const body = newMessage.trim()
    if (!body) return
    sendMessageMutation.mutate({ gameId: selectedGame.id, body })
  }

  const handleResign = () => {
    if (!selectedGame) return
    resignMutation.mutate({ gameId: selectedGame.id })
  }

  const handleDelete = () => {
    if (!selectedGame) return
    deleteGameMutation.mutate({ gameId: selectedGame.id })
  }

  // Loading / empty
  if (selectedGameId && gamesQuery.isLoading) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <PageHeader title="Chess" />
        <Main className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="aspect-square max-w-[560px] w-full" />
        </Main>
      </div>
    )
  }

  if (!selectedGame) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <PageHeader title="Chess" />
        <Main className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
          {gamesQuery.error ? (
            <GeneralError
              error={gamesQuery.error}
              minimal
              mode="inline"
              reset={gamesQuery.refetch}
            />
          ) : (
            <GameEmptyState
              onNewGame={openNewGameDialog}
              hasExistingGames={games.length > 0}
            />
          )}
        </Main>
      </div>
    )
  }

  const opponentName = game
    ? game.identity === myIdentity
      ? game.opponent_name
      : game.identity_name
    : ''

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden">
        <PageHeader
          title={opponentName ? `vs ${opponentName}` : 'Chess'}
          actions={
            game && game.status !== 'active' ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreHorizontal className="size-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={handleDelete}>
                    <Trash2 className="mr-2 size-4" /> Delete game
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : undefined
          }
        />

        <Main className="flex min-h-0 flex-1 overflow-hidden">
          {/* Left: Board */}
          <div className="flex flex-1 flex-col overflow-y-auto p-4">
            {isLoadingDetail ? (
              <Skeleton className="aspect-square max-w-[560px] w-full mx-auto" />
            ) : game && chess ? (
              <>
                <GameStatus
                  game={game}
                  myColor={myColor}
                  isMyTurn={isMyTurn}
                  isCheck={isCheck}
                  onResign={() => setShowResignDialog(true)}
                  isResigning={resignMutation.isPending}
                  myIdentity={myIdentity}
                />
                <ChessBoard
                  fen={game.fen}
                  myColor={myColor}
                  isMyTurn={isMyTurn}
                  gameStatus={game.status}
                  onMove={handleMove}
                  lastMove={lastMove}
                />
              </>
            ) : null}
          </div>

          {/* Right: Chat sidebar */}
          <div className="hidden md:flex w-72 lg:w-80 flex-col border-l">
            <div className="border-b px-3 py-2">
              <h3 className="text-sm font-medium">Chat</h3>
            </div>
            <ChatMessageList
              messagesQuery={messagesQuery}
              chatMessages={chatMessages}
              isLoadingMessages={messagesQuery.isLoading}
              messagesError={messagesQuery.error}
              currentUserIdentity={myIdentity}
            />
            <ChatInput
              newMessage={newMessage}
              setNewMessage={setNewMessage}
              onSendMessage={handleSendMessage}
              isSending={sendMessageMutation.isPending}
              errorMessage={
                sendMessageMutation.error
                  ? getErrorMessage(sendMessageMutation.error, 'Failed to send')
                  : null
              }
            />
          </div>
        </Main>
      </div>

      {/* Resign confirmation */}
      <AlertDialog
        open={showResignDialog}
        onOpenChange={setShowResignDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resign game?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to resign? {opponentName} will win the game.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resignMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleResign}
              disabled={resignMutation.isPending}
            >
              {resignMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Resigning...
                </>
              ) : (
                'Resign'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
