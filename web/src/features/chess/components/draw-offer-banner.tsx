// Copyright © 2026 Mochi OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { Trans, useLingui } from '@lingui/react/macro'
import { Button } from '@mochi/web'
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
  const { t } = useLingui()
  const disabled = isAccepting || isDeclining
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/50 px-3 py-2">
      <span className="text-sm font-medium">
        <Trans>{opponentName} offered a draw</Trans>
      </span>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onDecline}
          disabled={disabled}
        >
          {isDeclining ? <Loader2 className="size-4 animate-spin" /> : t`Decline`}
        </Button>
        <Button
          size="sm"
          onClick={onAccept}
          disabled={disabled}
        >
          {isAccepting ? <Loader2 className="size-4 animate-spin" /> : t`Accept`}
        </Button>
      </div>
    </div>
  )
}
