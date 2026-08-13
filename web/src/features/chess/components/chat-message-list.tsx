// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import type {
  UseInfiniteQueryResult,
  InfiniteData,
} from '@tanstack/react-query'
import { GameChatMessageList } from '@mochi/web'
import { Trans, useLingui } from '@lingui/react/macro'
import type { GameMessage, GetMessagesResponse } from '@/api/games'

interface ChatMessageListProps {
  messagesQuery: UseInfiniteQueryResult<
    InfiniteData<GetMessagesResponse>,
    unknown
  >
  chatMessages: GameMessage[]
  isLoadingMessages: boolean
  messagesError: unknown
  currentUserIdentity: string
}

export function ChatMessageList({
  messagesQuery,
  chatMessages,
  isLoadingMessages,
  messagesError,
  currentUserIdentity,
}: ChatMessageListProps) {
  const { t } = useLingui()

  return (
    <GameChatMessageList
      messagesQuery={messagesQuery}
      chatMessages={chatMessages}
      isLoadingMessages={isLoadingMessages}
      messagesError={messagesError}
      currentUserIdentity={currentUserIdentity}
      emptyLabel={t`No messages yet`}
      systemLabels={{
        resigned: (name) => t`${name} resigned`,
        drawOffered: (name) => t`${name} offered a draw`,
        drawAgreed: t`Draw agreed`,
        drawDeclined: (name) => t`${name} declined the draw`,
      }}
      renderMove={(message, isSent) => {
        // A capture is worth calling out; SAN marks one with an "x".
        const san = message.body
        const subject = isSent ? t`You` : message.name
        return san.includes('x') ? (
          <Trans>
            {subject} took <span className="font-mono">{san}</span>
          </Trans>
        ) : (
          <Trans>
            {subject} played <span className="font-mono">{san}</span>
          </Trans>
        )
      }}
    />
  )
}
