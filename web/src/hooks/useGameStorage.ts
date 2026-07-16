// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { shellStorage } from '@mochi/web'

const LAST_GAME_KEY = 'mochi-chess-last'

export const setLastGame = (gameId: string) => {
  shellStorage.setItem(LAST_GAME_KEY, gameId)
}

export const getLastGame = async (): Promise<string | null> => {
  return shellStorage.getItem(LAST_GAME_KEY)
}

export const clearLastGame = () => {
  shellStorage.removeItem(LAST_GAME_KEY)
}
