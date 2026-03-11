import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react'
import type {
  UseInfiniteQueryResult,
  InfiniteData,
} from '@tanstack/react-query'
import {
  GeneralError,
  LoadMoreTrigger,
  cn,
  Skeleton,
  getChatBubbleToneClass,
} from '@mochi/common'
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
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const prevScrollHeightRef = useRef<number>(0)
  const isLoadingMoreRef = useRef(false)
  const skipNextAutoScrollRef = useRef(false)
  const isInitialLoadRef = useRef(true)
  const prevMessageCountRef = useRef<number>(0)

  const isCurrentUserMessage = (message: GameMessage) => {
    if (!currentUserIdentity) return false
    return message.member === currentUserIdentity
  }

  const groupedMessages = useMemo(() => {
    const groups: Record<string, GameMessage[]> = {}
    chatMessages.forEach((message) => {
      const date = new Date(message.created * 1000).toLocaleDateString()
      if (!groups[date]) {
        groups[date] = []
      }
      groups[date].push(message)
    })
    return groups
  }, [chatMessages])

  const handleLoadMore = useCallback(() => {
    if (messagesQuery.isFetchingNextPage || !messagesQuery.hasNextPage) return

    if (scrollContainerRef.current) {
      prevScrollHeightRef.current = scrollContainerRef.current.scrollHeight
      isLoadingMoreRef.current = true
    }

    messagesQuery.fetchNextPage()
  }, [messagesQuery])

  useLayoutEffect(() => {
    if (
      isLoadingMoreRef.current &&
      scrollContainerRef.current &&
      !messagesQuery.isFetchingNextPage
    ) {
      const newScrollHeight = scrollContainerRef.current.scrollHeight
      const scrollDiff = newScrollHeight - prevScrollHeightRef.current
      scrollContainerRef.current.scrollTop += scrollDiff
      skipNextAutoScrollRef.current = true
      isLoadingMoreRef.current = false
    }
  }, [chatMessages, messagesQuery.isFetchingNextPage])

  useEffect(() => {
    const prevCount = prevMessageCountRef.current
    const currentCount = chatMessages.length

    if (isInitialLoadRef.current && currentCount > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' })
      isInitialLoadRef.current = false
    } else if (skipNextAutoScrollRef.current) {
      skipNextAutoScrollRef.current = false
    } else if (!isLoadingMoreRef.current && currentCount > prevCount) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      })
    }

    prevMessageCountRef.current = currentCount
  }, [chatMessages])

  if (isLoadingMessages) {
    return (
      <div className="flex flex-1 w-full flex-col justify-end gap-3 p-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'flex w-full flex-col gap-1',
              i % 2 === 0 ? 'items-start' : 'items-end'
            )}
          >
            <Skeleton
              className={cn(
                'h-8 w-[70%] rounded-[12px]',
                i % 2 === 0 ? 'rounded-bl-[4px]' : 'rounded-br-[4px]'
              )}
            />
          </div>
        ))}
      </div>
    )
  }

  if (messagesError) {
    return (
      <div className="flex w-full flex-1 flex-col items-center justify-center py-4">
        <GeneralError
          error={messagesError}
          minimal
          mode="inline"
          reset={messagesQuery.refetch}
          className="w-full max-w-md"
        />
      </div>
    )
  }

  if (chatMessages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-4 text-center">
        <p className="text-muted-foreground text-xs">No messages yet</p>
      </div>
    )
  }

  return (
    <div
      ref={scrollContainerRef}
      className="flex w-full flex-1 flex-col justify-start gap-2 overflow-y-auto py-2 px-3 pb-3"
    >
      <LoadMoreTrigger
        onLoadMore={handleLoadMore}
        hasMore={messagesQuery.hasNextPage ?? false}
        isLoading={messagesQuery.isFetchingNextPage}
        rootMargin="100px"
      />

      {Object.keys(groupedMessages).map((key) => (
        <Fragment key={key}>
          <div className="my-2 flex items-center justify-center">
            <div className="text-muted-foreground text-[10px]">{key}</div>
          </div>

          {groupedMessages[key].map((message, index) => {
            // System messages
            if (message.type === 'system') {
              return (
                <div
                  key={`${message.id}-${index}`}
                  className="flex justify-center py-1"
                >
                  <span className="text-muted-foreground text-[11px] italic">
                    {message.body}
                  </span>
                </div>
              )
            }

            // Move messages
            if (message.type === 'move') {
              const isSent = isCurrentUserMessage(message)
              const san = message.body
              const isCapture = san.includes('x')
              const verb = isCapture ? 'took' : 'played'
              return (
                <div
                  key={`${message.id}-${index}`}
                  className="flex justify-center py-0.5"
                >
                  <span className="text-[11px] text-muted-foreground/60">
                    {isSent ? 'You' : message.name} {verb}{' '}
                    <span className="font-mono">{san}</span>
                  </span>
                </div>
              )
            }

            // Regular chat messages
            const isSent = isCurrentUserMessage(message)
            return (
              <div
                key={`${message.id}-${index}`}
                className={cn(
                  'group mb-1 flex w-full flex-col gap-0.5',
                  isSent ? 'items-end' : 'items-start'
                )}
              >
                <div className="flex items-end gap-1.5">
                  {isSent && (
                    <span className="text-muted-foreground/70 opacity-0 transition-opacity group-hover:opacity-100 text-[9px]">
                      {new Date(message.created * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </span>
                  )}

                  <div
                    className={cn(
                      'relative max-w-[85%] px-2.5 py-1.5 text-sm wrap-break-word',
                      getChatBubbleToneClass(isSent)
                    )}
                  >
                    <p className="leading-relaxed whitespace-pre-wrap">
                      {message.body}
                    </p>
                  </div>

                  {!isSent && (
                    <span className="text-muted-foreground/70 opacity-0 transition-opacity group-hover:opacity-100 text-[9px]">
                      {new Date(message.created * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </Fragment>
      ))}
      <div ref={messagesEndRef} />
    </div>
  )
}
