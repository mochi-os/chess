// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { GameEmptyState as SharedGameEmptyState } from '@mochi/web'
import { Swords } from 'lucide-react'

interface GameEmptyStateProps {
  onNewGame: () => void
  hasExistingGames: boolean
}

export function GameEmptyState(props: GameEmptyStateProps) {
  return <SharedGameEmptyState {...props} icon={Swords} />
}
