import type { User, ChatGroup, Message, GroupMember, PendingMessage, PendingGroup } from './types';

const API_BASE = 'http://localhost:3000';

// Global user ID for API requests
let currentUserId: string | null = null;

export function setCurrentUserId(userId: string | null) {
  currentUserId = userId;
}

export function getCurrentUserId(): string | null {
  return currentUserId;
}

export class ApiError extends Error {
  public status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function apiCall<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  if (!currentUserId) {
    throw new ApiError(401, 'No user logged in');
  }
  
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': currentUserId,
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new ApiError(response.status, await response.text());
  }

  return response.json();
}

export async function getUserByUsername(username: string): Promise<User> {
  // This endpoint doesn't require authentication since it's for login
  const response = await fetch(`${API_BASE}/users/by-username/${encodeURIComponent(username)}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new ApiError(response.status, await response.text());
  }

  return response.json();
}

export async function getCurrentUser(): Promise<User> {
  return apiCall<User>('/users/me');
}

export async function getGroups(): Promise<{ groups: ChatGroup[]; syncTimestamp: string }> {
  return apiCall<{ groups: ChatGroup[]; syncTimestamp: string }>('/groups');
}

export async function createGroup(name: string, description?: string, localId?: string): Promise<ChatGroup> {
  return apiCall<ChatGroup>('/groups', {
    method: 'POST',
    body: JSON.stringify({ name, description, localId }),
  });
}

export async function getGroupMessages(
  groupId: string,
  since?: string,
  limit: number = 50
): Promise<{ messages: Message[]; syncTimestamp: string; hasMore: boolean }> {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (since) params.append('since', since);

  return apiCall<{ messages: Message[]; syncTimestamp: string; hasMore: boolean }>(
    `/groups/${groupId}/messages?${params}`
  );
}

export async function sendMessage(
  groupId: string,
  content: string,
  localId?: string
): Promise<Message> {
  return apiCall<Message>(`/groups/${groupId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content, localId }),
  });
}

export async function getGroupMembers(groupId: string): Promise<{ members: GroupMember[]; syncTimestamp: string }> {
  return apiCall<{ members: GroupMember[]; syncTimestamp: string }>(`/groups/${groupId}/members`);
}

export async function joinGroup(groupId: string, localId?: string): Promise<unknown> {
  return apiCall(`/groups/${groupId}/members`, {
    method: 'POST',
    body: JSON.stringify({ localId }),
  });
}

export async function addUserToGroup(groupId: string, userId: string): Promise<unknown> {
  return apiCall(`/groups/${groupId}/members`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export async function getAllUsers(): Promise<User[]> {
  const response = await apiCall<{ users: User[] }>('/users');
  return response.users;
}

export async function syncMessages(messages: PendingMessage[], lastSyncTimestamp?: string): Promise<unknown> {
  console.log('Syncing messages to server:', messages, lastSyncTimestamp);
  const body = {
    messages,
    lastSyncTimestamp: lastSyncTimestamp || '1970-01-01T00:00:00.000Z'
  };
  return apiCall('/sync/messages', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function syncGroups(groups: PendingGroup[], lastSyncTimestamp?: string): Promise<unknown> {
  console.log('Syncing groups to server:', groups, lastSyncTimestamp);
  const body = {
    groups,
    lastSyncTimestamp: lastSyncTimestamp || '1970-01-01T00:00:00.000Z'
  };
  return apiCall('/sync/groups', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
