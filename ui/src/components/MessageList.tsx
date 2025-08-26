import { useEffect, useRef, useMemo } from 'react';
import { useApp } from '../hooks/useApp';
import type { Message } from '../types';

interface MessageItemProps {
  message: Message;
  isOwnMessage: boolean;
}

function MessageItem({ message, isOwnMessage }: MessageItemProps) {
  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getSyncStatusIcon = () => {
    switch (message.syncStatus) {
      case 'synced':
        return '✓';
      case 'pending':
        return '⏳';
      case 'failed':
        return '❌';
      default:
        return '';
    }
  };

  return (
    <div className={`message ${isOwnMessage ? 'own-message' : ''}`}>
      <div className="message-header">
        <span className="username">{message.user?.displayName || message.user?.username || 'Unknown User'}</span>
        <span className="timestamp">{formatTime(message.createdAt)}</span>
        {isOwnMessage && (
          <span className="sync-status">{getSyncStatusIcon()}</span>
        )}
      </div>
      <div className="message-content">{message.content}</div>
    </div>
  );
}

export function MessageList() {
  const { state, loadGroupData, isUserMember } = useApp();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeGroupData = state.activeGroupId
    ? state.groupData[state.activeGroupId]
    : null;

  const messages = useMemo(() =>
    activeGroupData?.messages || [],
    [activeGroupData?.messages]
  );

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (state.activeGroupId && !activeGroupData) {
      loadGroupData(state.activeGroupId);
    }
  }, [state.activeGroupId, activeGroupData, loadGroupData]);

  if (!state.activeGroupId) {
    return (
      <div className="message-list no-group">
        <div className="placeholder">Select a group to start chatting</div>
      </div>
    );
  }

  // Check if user is a member of the active group
  const isMember = state.activeGroupId ? isUserMember(state.activeGroupId) : false;

  if (!activeGroupData) {
    return (
      <div className="message-list loading">
        <div className="placeholder">Loading messages...</div>
      </div>
    );
  }

  if (!isMember) {
    const activeGroup = state.groups.find(g => g.id === state.activeGroupId);
    return (
      <div className="message-list not-member">
        <div className="placeholder">
          <h3>You're not a member of {activeGroup?.name}</h3>
          <p>Join this group to see messages and participate in conversations.</p>
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="message-list empty">
        <div className="placeholder">No messages yet. Send the first one!</div>
      </div>
    );
  }

  return (
    <div className="message-list">
      <div className="messages">
        {messages
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          .map(message => (
            <MessageItem
              key={message.id}
              message={message}
              isOwnMessage={message.user?.id === state.user?.id}
            />
          ))}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
