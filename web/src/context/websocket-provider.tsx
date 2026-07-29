// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { GameWebsocketProvider } from '@mochi/web'
import { type ReactNode } from 'react'
import { gamesApi } from '@/api/games'

export const WebsocketProvider = ({ children }: { children: ReactNode }) => (
  <GameWebsocketProvider
    getGameKey={async (gameId) => (await gamesApi.detail(gameId)).game.key}
  >
    {children}
  </GameWebsocketProvider>
)
