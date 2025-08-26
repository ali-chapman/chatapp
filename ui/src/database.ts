import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { ChatGroup, Message, GroupMember, User, SyncState, GroupData, PendingGroup, PendingMembershipEvent } from './types';

interface ChatAppDB extends DBSchema {
  groups: {
    key: string;
    value: ChatGroup;
  };
  messages: {
    key: string;
    value: Message;
    indexes: { 'by-group': string };
  };
  members: {
    key: string;
    value: GroupMember & { groupId: string };
    indexes: { 'by-group': string };
  };
  syncState: {
    key: string;
    value: SyncState & { groupId: string };
  };
  user: {
    key: 'current';
    value: User;
  };
  pendingGroups: {
    key: string;
    value: PendingGroup;
  };
  pendingMembershipEvents: {
    key: string;
    value: PendingMembershipEvent;
    indexes: { 'by-group': string };
  };
}

let db: IDBPDatabase<ChatAppDB>;

export async function initDatabase(): Promise<IDBPDatabase<ChatAppDB>> {
  if (db) return db;

  db = await openDB<ChatAppDB>('chatapp', 3, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('groups', { keyPath: 'id' });

        const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
        messageStore.createIndex('by-group', 'groupId');

        const memberStore = db.createObjectStore('members', { keyPath: ['groupId', 'userId'] });
        memberStore.createIndex('by-group', 'groupId');

        db.createObjectStore('syncState', { keyPath: 'groupId' });
        db.createObjectStore('user');
      }

      if (oldVersion < 2) {
        db.createObjectStore('pendingGroups', { keyPath: 'localId' });
      }

      if (oldVersion < 3) {
        const pendingMembershipStore = db.createObjectStore('pendingMembershipEvents', { keyPath: 'localId' });
        pendingMembershipStore.createIndex('by-group', 'groupId');
      }
    },
  });

  return db;
}

export async function storeUser(user: User): Promise<void> {
  const database = await initDatabase();
  await database.put('user', user, 'current');
}

export async function getCurrentUser(): Promise<User | undefined> {
  const database = await initDatabase();
  return await database.get('user', 'current');
}

export async function storeGroups(groups: ChatGroup[]): Promise<void> {
  const database = await initDatabase();
  const tx = database.transaction('groups', 'readwrite');
  await Promise.all(groups.map(group => tx.store.put(group)));
  await tx.done;
}

export async function getGroups(): Promise<ChatGroup[]> {
  const database = await initDatabase();
  return await database.getAll('groups');
}

export async function storeMessages(groupId: string, messages: Message[]): Promise<void> {
  console.log('Storing messages for group', groupId, messages);
  const database = await initDatabase();
  const tx = database.transaction('messages', 'readwrite');
  
  // Get existing messages to avoid duplicates
  const existingMessages = await tx.store.index('by-group').getAll(groupId);
  const existingIds = new Set(existingMessages.map(m => m.id));
  
  // Only store messages that don't already exist
  const newMessages = messages.filter(message => !existingIds.has(message.id));
  
  await Promise.all(newMessages.map(message => tx.store.put(message)));
  await tx.done;
  
  if (newMessages.length > 0) {
    console.log('Stored', newMessages.length, 'new messages for group', groupId);
  }
}

export async function getMessages(groupId: string): Promise<Message[]> {
  const database = await initDatabase();
  return await database.getAllFromIndex('messages', 'by-group', groupId);
}

export async function storeMembers(groupId: string, members: GroupMember[]): Promise<void> {
  const database = await initDatabase();
  const tx = database.transaction('members', 'readwrite');
  await Promise.all(
    members.map(member =>
      tx.store.put({ ...member, groupId })
    )
  );
  await tx.done;
}

export async function getMembers(groupId: string): Promise<GroupMember[]> {
  const database = await initDatabase();
  const membersWithGroupId = await database.getAllFromIndex('members', 'by-group', groupId);
  return membersWithGroupId.map(({ groupId, ...member }) => {
    void groupId; // Mark as intentionally unused
    return member;
  });
}

function validateTimestamp(timestamp: string | undefined | null): string {
  if (!timestamp) {
    return '1970-01-01T00:00:00.000Z';
  }
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    console.warn('Invalid timestamp detected, using epoch:', timestamp);
    return '1970-01-01T00:00:00.000Z';
  }
  return timestamp;
}

export async function storeSyncState(groupId: string, syncState: SyncState): Promise<void> {
  const database = await initDatabase();
  const validatedSyncState = {
    ...syncState,
    lastSyncTimestamp: validateTimestamp(syncState.lastSyncTimestamp),
    groupId
  };
  await database.put('syncState', validatedSyncState);
}

export async function getSyncState(groupId: string): Promise<SyncState | undefined> {
  const database = await initDatabase();
  const result = await database.get('syncState', groupId);
  if (result) {
    const { groupId, ...syncState } = result;
    void groupId; // Mark as intentionally unused
    return {
      ...syncState,
      lastSyncTimestamp: validateTimestamp(syncState.lastSyncTimestamp),
    };
  }
  return undefined;
}

export async function getGroupData(groupId: string): Promise<GroupData | null> {
  const database = await initDatabase();
  const group = await database.get('groups', groupId);
  if (!group) return null;

  const messages = await getMessages(groupId);
  const members = await getMembers(groupId);
  const syncState = await getSyncState(groupId) || {
    lastSyncTimestamp: '1970-01-01T00:00:00.000Z',
    pendingMessages: [],
    pendingMembershipEvents: []
  };

  return { group, messages, members, syncState };
}

export async function addPendingMessage(_groupId: string, message: Message): Promise<void> {
  const database = await initDatabase();
  await database.put('messages', message);
}

export async function removePendingMessages(groupId: string, localIds: string[]): Promise<void> {
  const database = await initDatabase();
  const tx = database.transaction('messages', 'readwrite');

  // Get all messages for the group
  const allMessages = await tx.store.index('by-group').getAll(groupId);

  // Remove the pending messages with matching local IDs
  for (const message of allMessages) {
    if (localIds.includes(message.id) && message.syncStatus === 'pending') {
      await tx.store.delete(message.id);
    }
  }

  await tx.done;
}

export async function addPendingGroup(pendingGroup: PendingGroup): Promise<void> {
  const database = await initDatabase();
  await database.put('pendingGroups', pendingGroup);
}

export async function getPendingGroups(): Promise<PendingGroup[]> {
  const database = await initDatabase();
  return await database.getAll('pendingGroups');
}

export async function removePendingGroups(localIds: string[]): Promise<void> {
  const database = await initDatabase();
  const tx = database.transaction('pendingGroups', 'readwrite');

  for (const localId of localIds) {
    await tx.store.delete(localId);
  }

  await tx.done;
}

export async function addPendingMembershipEvent(event: PendingMembershipEvent): Promise<void> {
  const database = await initDatabase();
  await database.put('pendingMembershipEvents', event);
}

export async function getPendingMembershipEvents(): Promise<PendingMembershipEvent[]> {
  const database = await initDatabase();
  return await database.getAll('pendingMembershipEvents');
}

export async function removePendingMembershipEvents(localIds: string[]): Promise<void> {
  const database = await initDatabase();
  const tx = database.transaction('pendingMembershipEvents', 'readwrite');

  for (const localId of localIds) {
    await tx.store.delete(localId);
  }

  await tx.done;
}

export async function removeGroupById(groupId: string): Promise<void> {
  const database = await initDatabase();
  await database.delete('groups', groupId);
}
