export type SyncStatus = 'PENDING' | 'SYNCED' | 'FAILED';

export interface PendingMembershipEvent {
  localId: string;
  groupId: string;
  action: 'JOIN' | 'LEAVE';
  timestamp: string;
}

export interface PendingMessage {
  localId: string;
  groupId: string;
  content: string;
  messageType: 'text' | 'system';
  createdAt: string;
}

export interface PendingGroup {
  localId: string;
  name: string;
  description?: string;
  createdAt: string;
}

export interface ResolvedConflict {
  conflictId: string;
  conflictType: string;
  resolutionApplied: string;
  userMessage: string;
  resolvedState: any;
}

export interface MembershipSyncRequest {
  events: PendingMembershipEvent[];
  lastSyncTimestamp: string;
}

export interface MessageSyncRequest {
  messages: PendingMessage[];
  lastSyncTimestamp: string;
}

export interface GroupSyncRequest {
  groups: PendingGroup[];
  lastSyncTimestamp: string;
}

export interface MembershipSyncResponse {
  conflictsResolved: ResolvedConflict[];
  serverEvents: any[];
  syncTimestamp: string;
  acceptedEvents: Array<{ localId: string; serverId: string }>;
}

export interface MessageSyncResponse {
  conflictsResolved: ResolvedConflict[];
  serverMessages: any[];
  syncTimestamp: string;
  acceptedMessages: Array<{ localId: string; serverId: string }>;
}

export interface GroupSyncResponse {
  conflictsResolved: ResolvedConflict[];
  serverGroups: any[];
  syncTimestamp: string;
  acceptedGroups: Array<{ localId: string; serverId: string }>;
}