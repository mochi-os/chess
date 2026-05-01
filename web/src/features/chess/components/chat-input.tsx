import { type FormEvent } from 'react'
import { Trans } from '@lingui/react/macro'
import { Button } from '@mochi/web'
import { Loader2, Send } from 'lucide-react'

interface ChatInputProps {
  newMessage: string
  setNewMessage: (msg: string) => void
  onSendMessage: (e: FormEvent) => void
  isSending: boolean
  errorMessage: string | null
}

export function ChatInput({
  newMessage,
  setNewMessage,
  onSendMessage,
  isSending,
  errorMessage,
}: ChatInputProps) {
  return (
    <form onSubmit={onSendMessage} className="flex w-full flex-col gap-1 p-2 pt-0">
      <div className="border-input bg-card focus-within:ring-ring flex w-full items-center gap-1.5 rounded-full border px-3 py-1.5 focus-within:ring-1 focus-within:outline-hidden">
        <label className="flex-1">
          <span className="sr-only"><Trans>Message</Trans></span>
          <input
            type="text"
            placeholder={"Type a message..."}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            className="w-full bg-inherit text-xs focus-visible:outline-hidden"
          />
        </label>
        <Button
          type="submit"
          size="icon"
          className="bg-primary hover:bg-primary/80 rounded-full transition-colors size-7"
          disabled={isSending || !newMessage.trim()}
          aria-label={"Send message"}
        >
          {isSending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Send size={14} />
          )}
        </Button>
      </div>
      {errorMessage && (
        <p className="text-destructive text-right text-[10px] px-1">
          {errorMessage}
        </p>
      )}
    </form>
  )
}
