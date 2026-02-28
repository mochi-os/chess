import { Button } from '@mochi/common'
import { Loader2 } from 'lucide-react'

interface DrawOfferBannerProps {
  opponentName: string
  onAccept: () => void
  onDecline: () => void
  isAccepting: boolean
  isDeclining: boolean
}

export function DrawOfferBanner({
  opponentName,
  onAccept,
  onDecline,
  isAccepting,
  isDeclining,
}: DrawOfferBannerProps) {
  const disabled = isAccepting || isDeclining
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/50 px-3 py-2">
      <span className="text-sm font-medium">
        {opponentName} offered a draw
      </span>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onDecline}
          disabled={disabled}
        >
          {isDeclining ? <Loader2 className="size-4 animate-spin" /> : 'Decline'}
        </Button>
        <Button
          size="sm"
          onClick={onAccept}
          disabled={disabled}
        >
          {isAccepting ? <Loader2 className="size-4 animate-spin" /> : 'Accept'}
        </Button>
      </div>
    </div>
  )
}
