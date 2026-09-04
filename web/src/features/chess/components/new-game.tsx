// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useEffect, useMemo, useState } from 'react'
import { Trans, useLingui } from '@lingui/react/macro'
import { useNavigate } from '@tanstack/react-router'
import {
  GameNewGameDialog,
  getErrorMessage,
  toast,
  type Person,
} from '@mochi/web'
import { useSidebarContext } from '@/context/sidebar-context'
import { useNewGameFriendsQuery, useCreateGameMutation } from '@/hooks/useGames'

export function NewGame() {
  const { t } = useLingui()
  const navigate = useNavigate()
  const { newGameDialogOpen: open, closeNewGameDialog } = useSidebarContext()
  const onOpenChange = (isOpen: boolean) => {
    if (!isOpen) closeNewGameDialog()
  }
  const [selectedFriend, setSelectedFriend] = useState<string>('')

  const { data, isLoading, error, refetch } = useNewGameFriendsQuery({
    enabled: open,
  })

  const createGameMutation = useCreateGameMutation({
    onSuccess: (data) => {
      onOpenChange(false)
      if (data.id) {
        navigate({ to: '/$gameId', params: { gameId: data.id } })
        toast.success(t`Game created`)
      }
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t`Failed to create game`))
    },
  })

  const friends = useMemo(() => data?.friends ?? [], [data?.friends])

  const friendsAsPeople: Person[] = useMemo(
    () => friends.map((f) => ({ id: f.id, name: f.name })),
    [friends]
  )

  const handleCreateGame = () => {
    if (!selectedFriend) {
      toast.error(t`Please select a friend`)
      return
    }
    createGameMutation.mutate(selectedFriend)
  }

  useEffect(() => {
    if (!open) setSelectedFriend('')
  }, [open])

  return (
    <GameNewGameDialog
      open={open}
      onOpenChange={onOpenChange}
      friends={friendsAsPeople}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      mode="single"
      value={selectedFriend}
      onChange={(value) => setSelectedFriend(value as string)}
      canSubmit={!!selectedFriend && !createGameMutation.isPending}
      isSubmitting={createGameMutation.isPending}
      onSubmit={handleCreateGame}
      labels={{
        title: <Trans>New game</Trans>,
        description: <Trans>Start a new chess game</Trans>,
        opponentLabel: <Trans>Choose opponent</Trans>,
        emptyTitle: <Trans>No friends yet</Trans>,
        emptyHint: <Trans>Add friends in the People app to start playing</Trans>,
        addFriends: <Trans>Add friends</Trans>,
        placeholder: t`Select a friend...`,
        emptyMessage: t`No friends found`,
        cancel: <Trans>Cancel</Trans>,
        submit: t`Start game`,
        submitting: t`Creating...`,
      }}
    />
  )
}
