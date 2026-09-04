// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { useNavigate, useParams } from '@tanstack/react-router'
import { Chess } from 'chess.js'
import {
  useAuthStore,
  usePageTitle,
  Main,
  GeneralError,
  GameHeader,
  GameHeaderStat,
  GameHeaderStoneDot,
  IconButton,
  getErrorMessage,
  toast,
  Skeleton,
  GameChatPanels,
  GameResignDialog,
  GameDeleteDialog,
  GamePlaceholderPage,
  useGameChatMessages,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  getAppPath,
} from '@mochi/web'
import { MoreHorizontal, Trash2, Flag, Handshake, RotateCcw, MessageCircle } from 'lucide-react'
import { useSidebarContext } from '@/context/sidebar-context'
import { resume } from '@/lib/pgn'
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
  useCreateGameMutation,
  useDrawOfferMutation,
  useDrawAcceptMutation,
  useDrawDeclineMutation,
} from '@/hooks/useGames'
import { GameEmptyState } from './components/game-empty-state'
import { ChessBoard } from './components/chess-board'
import { DrawOfferBanner } from './components/draw-offer-banner'
import { ChatMessageList } from './components/chat-message-list'


export function ChessGame() {
  const { t } = useLingui()
  usePageTitle(t`Chess`)

  const navigate = useNavigate()
  const { openNewGameDialog, setWebsocketStatus } = useSidebarContext()
  const [newMessage, setNewMessage] = useState('')
  const [showResignDialog, setShowResignDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showMobileChat, setShowMobileChat] = useState(false)
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
        (g) => g.id === selectedGameId
      ) ?? null,
    [games, selectedGameId]
  )

  // Cleared on switch and on the game's own position change: the marker is set
  // only from our own play, so it is stale both on the next game (drawn
  // wherever a stone/piece happens to sit) and once the opponent replies.
  useEffect(() => {
    setLastMove(null)
  }, [selectedGameId, selectedGame?.fen])

  // Game detail
  const {
    data: gameDetail,
    isLoading: isLoadingDetail,
    error: gameDetailError,
    refetch: refetchGameDetail,
  } = useGameDetailQuery(selectedGameId)

  const game = gameDetail?.game
  const myIdentity = gameDetail?.identity ?? currentUserIdentity

  // Chess state from game detail FEN
  const chess = useMemo(() => {
    if (!game?.fen) return null
    // A stored FEN can predate the server's six-field validation, or come
    // from a pre-fix peer; chess.js load() throws on one, and a throw here
    // crash-looped the whole view. A null chess renders the corrupt-position
    // state instead, leaving resign and delete reachable.
    try {
      const c = new Chess()
      c.load(game.fen)
      return c
    } catch {
      return null
    }
  }, [game?.fen])

  const myColor = game && myIdentity ? (game.white === myIdentity ? 'w' : 'b') : 'w'
  const isMyTurn = chess ? chess.turn() === myColor : false
  const isCheck = chess ? chess.isCheck() : false

  // Messages
  const messagesQuery = useInfiniteMessagesQuery(selectedGame?.id)
  const chatMessages = useGameChatMessages(messagesQuery.data?.pages)

  // Send message
  const sendMessageMutation = useSendMessageMutation({
    onSuccess: () => {
      setNewMessage('')
    },
  })

  // Move
  const moveMutation = useMoveMutation({
    onError: (error) => {
      toast.error(getErrorMessage(error, t`Failed to make move`))
    },
  })

  // Resign
  const resignMutation = useResignMutation({
    onSuccess: () => {
      setShowResignDialog(false)
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t`Failed to resign`))
    },
  })

  // Draw
  const drawOfferMutation = useDrawOfferMutation({
    onError: (error) => {
      toast.error(getErrorMessage(error, t`Failed to offer draw`))
    },
  })
  const drawAcceptMutation = useDrawAcceptMutation({
    onError: (error) => {
      toast.error(getErrorMessage(error, t`Failed to accept draw`))
    },
  })
  const drawDeclineMutation = useDrawDeclineMutation({
    onError: (error) => {
      toast.error(getErrorMessage(error, t`Failed to decline draw`))
    },
  })

  // Rematch
  const rematchMutation = useCreateGameMutation({
    onSuccess: (data) => {
      void navigate({ to: '/$gameId', params: { gameId: data.id } })
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t`Failed to create rematch`))
    },
  })

  // Delete
  const deleteGameMutation = useDeleteGameMutation({
    onSuccess: () => {
      setShowDeleteDialog(false)
      toast.success(t`Game deleted`)
      void navigate({ to: '/' })
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t`Failed to delete game`))
    },
  })

  // WebSocket
  const { status, retries } = useGameWebsocket(
    selectedGame?.id,
    // From the detail row: the list never carries key, so passing
    // selectedGame?.key was always undefined and made the websocket manager
    // refetch /view just to learn it.
    game?.key
  )
  useEffect(() => {
    setWebsocketStatus(status, retries)
  }, [status, retries, setWebsocketStatus])

  const handleMove = useCallback(
    (from: string, to: string, promotion?: string) => {
      if (!game || !selectedGame) return

      // chess.js v1 throws on a corrupt FEN or an illegal move rather than
      // returning null. resume() replays the stored PGN so c.pgn() below
      // EXTENDS the game score; loading the FEN alone starts an empty history
      // and every move would replace the record with just itself.
      let c: Chess
      let move: ReturnType<Chess['move']>
      try {
        c = resume(game.fen, game.pgn)
        move = c.move({ from, to, promotion })
      } catch {
        return
      }

      let moveStatus = ''
      let winner = ''
      if (c.isCheckmate()) {
        // Only claim the win when the identity actually resolved - an empty one
        // records checkmate with a NULL winner, which the status line then reads
        // as the loser having won.
        if (!myIdentity) return
        moveStatus = 'checkmate'
        winner = myIdentity
      } else if (c.isStalemate()) {
        moveStatus = 'stalemate'
      } else if (c.isDraw()) {
        moveStatus = 'draw'
      }

      setLastMove({ from, to })
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
      <GamePlaceholderPage title={t`Chess`} mainClassName="p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="aspect-square max-w-[560px] w-full" />
      </GamePlaceholderPage>
    )
  }

  if (!selectedGame) {
    return (
      <GamePlaceholderPage title={t`Chess`}>
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
      </GamePlaceholderPage>
    )
  }

  const opponentName = game
    ? game.identity === myIdentity
      ? game.opponent_name
      : game.identity_name
    : ''

  // Inline rather than a helper taking `t`: the Lingui macro only rewrites
  // templates tagged with the identifier destructured from useLingui(), so a
  // `t` passed as a parameter is a different binding and none of these is
  // extracted or rendered.
  const headline = !game
    ? ''
    : game.status === 'checkmate'
      ? game.winner === myIdentity
        ? t`Checkmate — you win!`
        : t`Checkmate — ${opponentName} wins`
      : game.status === 'stalemate'
        ? t`Stalemate — draw`
        : game.status === 'draw'
          ? t`Draw`
          : game.status === 'resigned'
            ? game.winner === myIdentity
              ? t`${opponentName} resigned — you win!`
              : t`You resigned — ${opponentName} wins`
            : // Whose move it is comes from the parsed position. With no
              // position there is no turn to state, and asserting one names
              // the wrong player half the time.
              chess === null
              ? t`Game state unavailable`
              : isCheck
                ? isMyTurn
                  ? t`Check — your move`
                  : t`Check — ${opponentName}'s move`
                : isMyTurn
                  ? t`Your move`
                  : t`${opponentName}'s move`

  const opponentFingerprint = game
    ? game.identity === myIdentity
      ? game.opponent
      : game.identity
    : ''
  // The opponent's avatar and style come through this app's own game-bound
  // player-asset route, never a cross-app fetch from the people app.
  const opponentAssetUrl = (asset: 'avatar' | 'style') =>
    opponentFingerprint && selectedGameId
      ? `${getAppPath()}/${selectedGameId}/-/user/${opponentFingerprint}/asset/${asset}`
      : null

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden">
        <Main className="flex min-h-0 flex-1 overflow-hidden">
          {/* Left: Board */}
          <div className="flex flex-1 flex-col px-2 sm:px-4 pb-2 min-h-0">
            {isLoadingDetail ? (
              <Skeleton className="aspect-square max-w-[560px] w-full mx-auto" />
            ) : gameDetailError ? (
              <GeneralError
                error={gameDetailError}
                minimal
                mode="inline"
                reset={refetchGameDetail}
              />
            ) : game ? (
              <>
                <div className="shrink-0">
                  <GameHeader
                    variant='strip'
                    myTurn={game.status === 'active' ? isMyTurn : undefined}
                    title={opponentName}
                    opponentName={opponentName}
                    opponentAvatarUrl={opponentAssetUrl('avatar')}
                    opponentStyleUrl={opponentAssetUrl('style')}
                    status={headline}
                    stats={
                      <GameHeaderStat
                        icon={<GameHeaderStoneDot color={myColor === 'w' ? 'white' : 'black'} />}
                        label={myColor === 'w' ? t`White` : t`Black`}
                      />
                    }
                    actions={
                      <>
                        <IconButton
                          variant='ghost'
                          className='lg:hidden'
                          onClick={() => setShowMobileChat(true)}
                          label={t`Open chat panel`}
                        >
                          <MessageCircle className='size-4' />
                        </IconButton>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <IconButton
                              variant='ghost'
                              label={t`Open game actions`}
                            >
                              <MoreHorizontal className='size-4' />
                            </IconButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align='end' className='w-48'>
                            {game.status === 'active' ? (
                              <>
                                {game.draw_offer !== myIdentity && (
                                  <DropdownMenuItem
                                    onClick={handleDrawOffer}
                                    disabled={drawOfferMutation.isPending}
                                  >
                                    <Handshake className='me-2 size-4' /> <Trans>Offer draw</Trans>
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => setShowResignDialog(true)}>
                                  <Flag className='me-2 size-4' /> <Trans>Resign</Trans>
                                </DropdownMenuItem>
                              </>
                            ) : (
                              <>
                                <DropdownMenuItem
                                  onClick={handleRematch}
                                  disabled={rematchMutation.isPending}
                                >
                                  <RotateCcw className='me-2 size-4' /> <Trans>Rematch</Trans>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setShowDeleteDialog(true)}>
                                  <Trash2 className='me-2 size-4' /> <Trans>Delete game</Trans>
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    }
                    banner={
                      game.draw_offer
                        ? game.draw_offer === myIdentity
                          ? (
                              <p className='text-sm text-muted-foreground'>
                                <Trans>Draw offered — waiting for {opponentName}</Trans>
                              </p>
                            )
                          : (
                              <DrawOfferBanner
                                opponentName={opponentName}
                                onAccept={handleDrawAccept}
                                onDecline={handleDrawDecline}
                                isAccepting={drawAcceptMutation.isPending}
                                isDeclining={drawDeclineMutation.isPending}
                              />
                            )
                        : undefined
                    }
                  />
                </div>
                <div className="flex-1 min-h-0 mt-3" style={{ containerType: 'size' }}>
                  {chess ? (
                    <ChessBoard
                      fen={game.fen}
                      myColor={myColor}
                      isMyTurn={isMyTurn}
                      gameStatus={game.status}
                      onMove={handleMove}
                      lastMove={lastMove}
                    />
                  ) : (
                    // The stored FEN would not load (see the chess useMemo).
                    // The board is unrenderable but the rest of the view -
                    // chat, resign, delete - stays functional, so the game
                    // can still be ended and removed.
                    <GeneralError minimal />
                  )}
                </div>
              </>
            ) : null}
          </div>

          {/* Right: Chat sidebar, plus the mobile sheet through its portal */}
          <GameChatPanels
            sidebarClassName="hidden lg:flex w-72 xl:w-80"
            title={<Trans>Chat</Trans>}
            messageList={
              <ChatMessageList
                key={selectedGame.id}
                messagesQuery={messagesQuery}
                chatMessages={chatMessages}
                isLoadingMessages={messagesQuery.isLoading}
                messagesError={messagesQuery.error}
                currentUserIdentity={myIdentity}
              />
            }
            newMessage={newMessage}
            setNewMessage={setNewMessage}
            onSendMessage={handleSendMessage}
            isSending={sendMessageMutation.isPending}
            sendErrorMessage={
              sendMessageMutation.error
                ? getErrorMessage(sendMessageMutation.error, t`Failed to send`)
                : null
            }
            sheetOpen={showMobileChat}
            onSheetOpenChange={setShowMobileChat}
          />
        </Main>
      </div>

      <GameResignDialog
        open={showResignDialog}
        onOpenChange={setShowResignDialog}
        opponentName={opponentName}
        onConfirm={handleResign}
        isPending={resignMutation.isPending}
      />

      <GameDeleteDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={handleDelete}
        isPending={deleteGameMutation.isPending}
      />

    </>
  )
}
