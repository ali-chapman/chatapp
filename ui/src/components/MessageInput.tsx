import { useState } from 'react';
import { useApp } from '../hooks/useApp';

export function MessageInput() {
  const { state, sendMessage, isUserMember } = useApp();
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!message.trim() || !state.activeGroupId || isSending) return;

    setIsSending(true);
    try {
      await sendMessage(state.activeGroupId, message.trim());
      setMessage('');
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent<HTMLFormElement>);
    }
  };

  if (!state.activeGroupId) {
    return null;
  }

  // Don't show message input if user is not a member
  const isMember = isUserMember(state.activeGroupId);
  if (!isMember) {
    return null;
  }

  const isDisabled = isSending || !state.user;
  const placeholder = state.isOnline
    ? 'Type a message...'
    : 'Type a message (will send when back online)...';

  return (
    <div className="message-input">
      <form onSubmit={handleSubmit}>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={placeholder}
          disabled={isDisabled}
          rows={1}
        />
        <button
          type="submit"
          disabled={isDisabled || !message.trim()}
        >
          {isSending ? 'Sending...' : 'Send'}
        </button>
      </form>

      {!state.isOnline && (
        <div className="offline-warning">
          Messages will be sent when you're back online
        </div>
      )}
    </div>
  );
}
