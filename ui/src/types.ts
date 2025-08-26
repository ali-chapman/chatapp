export interface User {
  id: string;
  username: string;
  displayName: string;
  isAdmin: boolean;
  createdAt: string;
}

export interface ChatGroup {
  id: string;
  entityType: 'GROUP';
  name: string;
  description?: string;
  createdBy: User;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  syncStatus?: 'synced' | 'pending' | 'failed';
  localId?: string;
  members: GroupMember[];
}

export interface GroupMember {
  userId: string;
  username: string;
  displayName: string;
  joinedAt: string;
}

export interface Message {
  id: string;
  groupId: string;
  user: User;
  content: string;
  messageType: 'text' | 'system';
  createdAt: string;
  syncStatus: 'synced' | 'pending' | 'failed';
}

export interface PendingMessage {
  localId: string;
  groupId: string;
  content: string;
  messageType: 'text' | 'system';
  createdAt: string;
}

export interface MembershipEvent {
  id: string;
  userId: string;
  groupId: string;
  action: 'JOIN' | 'LEAVE' | 'REMOVE';
  performedBy?: string;
  timestamp: string;
}

export interface PendingGroup {
  localId: string;
  name: string;
  description?: string;
  createdAt: string;
}

export interface PendingMembershipEvent {
  localId: string;
  groupId: string;
  action: 'JOIN' | 'LEAVE';
  timestamp: string;
}

export interface SyncState {
  lastSyncTimestamp: string;
  pendingMessages: PendingMessage[];
  pendingMembershipEvents: Record<string, unknown>[];
  pendingGroups?: PendingGroup[];
}

export interface GroupData {
  group: ChatGroup;
  messages: Message[];
  members: GroupMember[];
  syncState: SyncState;
}
