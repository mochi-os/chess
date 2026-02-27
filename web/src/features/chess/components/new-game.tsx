import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Button,
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  getErrorMessage,
  toast,
  Skeleton,
  PersonPicker,
  GeneralError,
  type Person,
} from '@mochi/common'
import { Loader2, Plus, UserPlus } from 'lucide-react'
import { useSidebarContext } from '@/context/sidebar-context'
import { useNewGameFriendsQuery, useCreateGameMutation } from '@/hooks/useGames'

export function NewGame() {
  const navigate = useNavigate()
  const { newGameDialogOpen: open, closeNewGameDialog } = useSidebarContext()
  const onOpenChange = (isOpen: boolean) => {
    if (!isOpen) closeNewGameDialog()
  }
  const [selectedFriend, setSelectedFriend] = useState<string>('')
  const [friendsPickerOpen, setFriendsPickerOpen] = useState(false)

  const { data, isLoading, error, refetch } = useNewGameFriendsQuery({
    enabled: open,
  })

  const createGameMutation = useCreateGameMutation({
    onSuccess: (data) => {
      onOpenChange(false)
      if (data.id) {
        navigate({ to: '/$gameId', params: { gameId: data.id } })
        toast.success('Game created')
      }
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to create game'))
    },
  })

  const friends = useMemo(() => data?.friends ?? [], [data?.friends])

  const friendsAsPeople: Person[] = useMemo(
    () => friends.map((f) => ({ id: f.id, name: f.name })),
    [friends]
  )

  const canSubmit = !!selectedFriend && !createGameMutation.isPending

  const handleCreateGame = () => {
    if (!selectedFriend) {
      toast.error('Please select a friend')
      return
    }
    createGameMutation.mutate(selectedFriend)
  }

  useEffect(() => {
    if (!open) {
      setSelectedFriend('')
      setFriendsPickerOpen(false)
    }
  }, [open])

  useEffect(() => {
    if (open && !isLoading && friends.length > 0) {
      const timer = setTimeout(() => setFriendsPickerOpen(true), 50)
      return () => clearTimeout(timer)
    }
  }, [open, isLoading, friends.length])

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      shouldCloseOnInteractOutside={false}
    >
      <ResponsiveDialogContent className="sm:max-w-[420px]">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="flex items-center gap-2">
            New Game
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="sr-only">
            Start a new chess game
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Choose opponent</label>
            {isLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : error ? (
              <GeneralError error={error} minimal mode="inline" reset={refetch} />
            ) : friends.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border py-8 text-center">
                <UserPlus className="text-muted-foreground mb-3 h-10 w-10 opacity-50" />
                <p className="text-muted-foreground text-sm font-medium">No friends yet</p>
                <p className="text-muted-foreground mt-1 text-xs">Add friends to play chess</p>
              </div>
            ) : (
              <PersonPicker
                mode="single"
                value={selectedFriend}
                onChange={(value) => setSelectedFriend(value as string)}
                local={friendsAsPeople}
                placeholder="Select a friend..."
                emptyMessage="No friends found"
                open={friendsPickerOpen}
                onOpenChange={setFriendsPickerOpen}
              />
            )}
          </div>
        </div>

        <ResponsiveDialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createGameMutation.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleCreateGame} disabled={!canSubmit}>
            {createGameMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            {createGameMutation.isPending ? 'Creating...' : 'Start game'}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
