import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { Chess } from 'chess.js'
import { useAuthStore, usePageTitle, useQueryWithError, PageHeader, Main, GeneralError, IconButton, getErrorMessage, getAppPath, toast, AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Skeleton, SubscribeDialog, Sheet, SheetContent, SheetHeader, SheetTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@mochi/common/realtime-shell'
import { MoreHorizontal, Trash2, Loader2, Flag, Handshake, RotateCcw, MessageCircle } from 'lucide-react'
import { useSidebarContext } from '@/context/sidebar-context'
import { setLastGame } from '@/hooks/useGameStorage'
import { useGameWebsocket } from '@/hooks/useGameWebsocket'
import { gamesApi } from '@/api/games'
import {
  useInfiniteMessagesQuery,
  useGamesQuery,
  useSendMessageMutation,
  useGameDetailQuery,
  useMoveMutation,
  useResignMutation,
  useDeleteGameMutation,
  useCreateGameMutation,
  useDrawOfferMutation,
  useDrawAcceptMutation,
  useDrawDeclineMutation,
} from '@/hooks/useGames'
import { GameEmptyState } from './components/game-empty-state'
import { ChessBoard } from './components/chess-board'
import { GameStatus } from './components/game-status'
import { DrawOfferBanner } from './components/draw-offer-banner'
import { ChatMessageList } from './components/chat-message-list'
import { ChatInput } from './components/chat-input'

export function ChessGame() {
  usePageTitle('Chess')

  const navigate = useNavigate()
  const { openNewGameDialog, setWebsocketStatus } = useSidebarContext()
  const [newMessage, setNewMessage] = useState('')
  const [showResignDialog, setShowResignDialog] = useState(false)
  const [showMobileChat, setShowMobileChat] = useState(false)
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null)
  const [subscribeOpen, setSubscribeOpen] = useState(false)

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

  // Draw
  const drawOfferMutation = useDrawOfferMutation({
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to offer draw'))
    },
  })
  const drawAcceptMutation = useDrawAcceptMutation({
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to accept draw'))
    },
  })
  const drawDeclineMutation = useDrawDeclineMutation({
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to decline draw'))
    },
  })

  // Rematch
  const rematchMutation = useCreateGameMutation({
    onSuccess: (data) => {
      void navigate({ to: '/$gameId', params: { gameId: data.id } })
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to create rematch'))
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

  // Subscription check
  const { data: subscriptionData, refetch: refetchSubscription } = useQueryWithError({
    queryKey: ['subscription-check', 'chess'],
    queryFn: () => gamesApi.checkSubscription(),
    staleTime: Infinity,
  })

  useEffect(() => {
    if (subscriptionData?.exists === false) {
      setSubscribeOpen(true)
    }
  }, [subscriptionData?.exists])

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

  const handleDrawOffer = () => {
    if (!selectedGame) return
    drawOfferMutation.mutate({ gameId: selectedGame.id })
  }

  const handleDrawAccept = () => {
    if (!selectedGame) return
    drawAcceptMutation.mutate({ gameId: selectedGame.id })
  }

  const handleDrawDecline = () => {
    if (!selectedGame) return
    drawDeclineMutation.mutate({ gameId: selectedGame.id })
  }

  const handleRematch = () => {
    if (!game || !myIdentity) return
    const opponentId = game.identity === myIdentity ? game.opponent : game.identity
    rematchMutation.mutate(opponentId)
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
        <Main className="flex min-h-0 flex-1 overflow-hidden">
          {/* Left: Board */}
          <div className="flex flex-1 flex-col overflow-y-auto px-2 sm:px-4 pb-2">
            {isLoadingDetail ? (
              <Skeleton className="aspect-square max-w-[560px] w-full mx-auto" />
            ) : game && chess ? (
              <>
                <div className="shrink-0 mb-3">
                  <GameStatus
                    game={game}
                    myColor={myColor}
                    isMyTurn={isMyTurn}
                    isCheck={isCheck}
                    myIdentity={myIdentity}
                  >
                    <IconButton
                      variant='ghost'
                      className='size-7 md:hidden'
                      onClick={() => setShowMobileChat(true)}
                      label='Open chat panel'
                    >
                      <MessageCircle className="size-4" />
                    </IconButton>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <IconButton
                          variant='ghost'
                          className='size-7'
                          label='Open game actions'
                        >
                          <MoreHorizontal className="size-4" />
                        </IconButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        {game.status === 'active' ? (
                          <>
                            {game.draw_offer !== myIdentity && (
                              <DropdownMenuItem onClick={handleDrawOffer} disabled={drawOfferMutation.isPending}>
                                <Handshake className="mr-2 size-4" /> Offer draw
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => setShowResignDialog(true)}>
                              <Flag className="mr-2 size-4" /> Resign
                            </DropdownMenuItem>
                          </>
                        ) : (
                          <>
                            <DropdownMenuItem onClick={handleRematch} disabled={rematchMutation.isPending}>
                              <RotateCcw className="mr-2 size-4" /> Rematch
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleDelete}>
                              <Trash2 className="mr-2 size-4" /> Delete game
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </GameStatus>
                  {game.draw_offer && game.draw_offer === myIdentity && (
                    <div className="px-1 py-1 text-sm text-muted-foreground">
                      Draw offered — waiting for {opponentName}
                    </div>
                  )}
                  {game.draw_offer && game.draw_offer !== myIdentity && (
                    <DrawOfferBanner
                      opponentName={opponentName}
                      onAccept={handleDrawAccept}
                      onDecline={handleDrawDecline}
                      isAccepting={drawAcceptMutation.isPending}
                      isDeclining={drawDeclineMutation.isPending}
                    />
                  )}
                </div>
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

      {/* Mobile chat sheet */}
      <Sheet open={showMobileChat} onOpenChange={setShowMobileChat}>
        <SheetContent side="right" className="flex flex-col p-0 w-80">
          <SheetHeader className="border-b px-3 py-2">
            <SheetTitle className="text-sm font-medium">Chat</SheetTitle>
          </SheetHeader>
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
        </SheetContent>
      </Sheet>

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

      <SubscribeDialog
        open={subscribeOpen}
        onOpenChange={setSubscribeOpen}
        app='chess'
        label='Chess moves & messages'
        appBase={getAppPath()}
        onResult={() => refetchSubscription()}
      />
    </>
  )
}
