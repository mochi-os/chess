// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useCallback } from 'react'
import { useLingui } from '@lingui/react/macro'
import {
  useGameWebsocket as useSharedGameWebsocket,
  type MergeMovePayload,
  type UseGameWebsocketResult,
} from '@mochi/web'
import { gameKeys } from '@/hooks/useGames'
import type { Game } from '@/api/games'

export const useGameWebsocket = (
  gameId?: string,
  gameKey?: string
): UseGameWebsocketResult => {
  const { t } = useLingui()

  // Chess carries the move list as PGN alongside the board.
  const mergeMove = useCallback<MergeMovePayload<Game>>(
    (game, payload) => ({
      pgn: (payload.pgn as string) ?? game.pgn,
    }),
    []
  )

  return useSharedGameWebsocket<Game>({
    gameId,
    gameKey,
    keys: gameKeys,
    unknownSenderLabel: t`Unknown`,
    mergeMove,
  })
}
