// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { GameEmptyState as SharedGameEmptyState, getAppPath } from '@mochi/web'

interface GameEmptyStateProps {
  onNewGame: () => void
  hasExistingGames: boolean
}

export function GameEmptyState(props: GameEmptyStateProps) {
  // The app's own icon, served by the "images" action and declared in app.json.
  // The launcher tile and the browser tab draw the same file. Resolved during
  // render, not at import: the app path arrives from the shell asynchronously.
  const icon = `${getAppPath()}/images/icon.svg`
  return <SharedGameEmptyState {...props} icon={icon} />
}
