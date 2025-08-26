import * as api from '../api';
import * as db from '../database';
import type { Message, PendingMessage, ChatGroup } from '../types';

interface MessageSyncResult {
  acceptedMessages: Array<{ localId: string; serverId: string }>;
  serverMessages: Array<unknown>;
  syncTimestamp: string;
}

interface GroupSyncResult {
  acceptedGroups: Array<{ localId: string; serverId: string }>;
  serverGroups: Array<unknown>;
  syncTimestamp: string;
}

export class SyncService {
  private syncInterval: number | null = null;
  private isSync = false;
  private onlineHandler: (() => void) | null = null;
  private syncEventListeners: ((groupId: string) => void)[] = [];

  start() {
    if (this.syncInterval) return;

    this.syncInterval = setInterval(() => {
      if (navigator.onLine && !this.isSync) {
        this.syncPendingData();
      }
    }, 1000); // Sync every 1 second for real-time messaging

    // Sync immediately when coming back online
    this.onlineHandler = () => {
      if (!this.isSync) {
        this.syncPendingData();
      }
    };
    window.addEventListener('online', this.onlineHandler);
  }

  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    if (this.onlineHandler) {
      window.removeEventListener('online', this.onlineHandler);
      this.onlineHandler = null;
    }
  }

  async syncPendingData() {
    if (this.isSync) return;

    this.isSync = true;
    try {
      await this.syncPendingGroups();
      await this.syncPendingMembershipEvents();
      await this.syncPendingMessages();
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      this.isSync = false;
    }
  }

  // Trigger immediate sync (useful after sending a message)
  triggerSync() {
    if (navigator.onLine && !this.isSync) {
      this.syncPendingData();
    }
  }

  // Add listener for sync events
  onSyncComplete(listener: (groupId: string) => void) {
    this.syncEventListeners.push(listener);
  }

  // Remove sync event listener
  removeSyncListener(listener: (groupId: string) => void) {
    const index = this.syncEventListeners.indexOf(listener);
    if (index > -1) {
      this.syncEventListeners.splice(index, 1);
    }
  }

  // Emit sync complete event
  private emitSyncComplete(groupId: string) {
    this.syncEventListeners.forEach(listener => listener(groupId));
  }

  private async syncPendingGroups() {
    const pendingGroups = await db.getPendingGroups();
    if (pendingGroups.length === 0) return;

    try {
      const result = await api.syncGroups(pendingGroups) as GroupSyncResult;

      // Process accepted groups
      if (result.acceptedGroups.length > 0) {
        const acceptedLocalIds = result.acceptedGroups.map(g => g.localId);
        await db.removePendingGroups(acceptedLocalIds);

        // Update local groups with server IDs
        const groups = await db.getGroups();
        const updatedGroups = groups.map(group => {
          if (group.localId) {
            const accepted = result.acceptedGroups.find(a => a.localId === group.localId);
            if (accepted) {
              return {
                ...group,
                id: accepted.serverId,
                syncStatus: 'synced' as const,
              };
            }
          }
          return group;
        });

        await db.storeGroups(updatedGroups);

        // Emit sync complete for each accepted group
        result.acceptedGroups.forEach(accepted => {
          this.emitSyncComplete(accepted.serverId);
        });
      }

      // Store new server groups
      if (result.serverGroups.length > 0) {
        const serverGroups = result.serverGroups as ChatGroup[];
        await db.storeGroups([...await db.getGroups(), ...serverGroups]);

        // Emit sync complete for new server groups
        serverGroups.forEach(group => {
          this.emitSyncComplete(group.id);
        });
      }

    } catch (error) {
      console.error('Failed to sync groups:', error);

      // Mark failed groups - update the groups in database to show failed status
      const groups = await db.getGroups();
      const updatedGroups = groups.map(group => {
        if (group.syncStatus === 'pending') {
          return { ...group, syncStatus: 'failed' as const };
        }
        return group;
      });
      await db.storeGroups(updatedGroups);
    }
  }

  private async syncPendingMembershipEvents() {
    const pendingEvents = await db.getPendingMembershipEvents();
    if (pendingEvents.length === 0) return;

    console.log('Syncing pending membership events:', pendingEvents);

    const processedEventIds: string[] = [];

    for (const event of pendingEvents) {
      try {
        if (event.action === 'JOIN') {
          await api.joinGroup(event.groupId);
          processedEventIds.push(event.localId);
          console.log('Successfully synced join event for group:', event.groupId);
        }
        // Note: We can add LEAVE functionality later if needed
      } catch (error) {
        console.error('Failed to sync membership event:', event, error);
        // Continue with other events even if one fails
      }
    }

    // Remove successfully processed events
    if (processedEventIds.length > 0) {
      await db.removePendingMembershipEvents(processedEventIds);

      // Refresh groups to get updated membership from server
      try {
        const { groups: fetchedGroups } = await api.getGroups();
        await db.storeGroups(fetchedGroups);

        // Emit sync complete events for affected groups
        const affectedGroupIds = pendingEvents
          .filter(e => processedEventIds.includes(e.localId))
          .map(e => e.groupId);

        affectedGroupIds.forEach(groupId => {
          this.emitSyncComplete(groupId);
        });

      } catch (error) {
        console.error('Failed to refresh groups after membership sync:', error);
      }
    }
  }

  private async syncPendingMessages() {
    const groups = await db.getGroups();
    const currentUser = await db.getCurrentUser();
    const userGroups = groups.filter(g => g.members?.some(m => m.userId === currentUser?.id));

    for (const group of userGroups) {
      const groupData = await db.getGroupData(group.id);
      if (!groupData) continue;

      const allMessages = groupData.messages;
      const pendingMessages = allMessages.filter(m => m.syncStatus === 'pending');

      if (pendingMessages.length > 0) {
        console.log("Pending messages for group", group.id, pendingMessages);
        const pendingApiMessages: PendingMessage[] = pendingMessages.map(m => ({
          localId: m.id,
          groupId: m.groupId,
          content: m.content,
          messageType: m.messageType,
          createdAt: m.createdAt,
        }));

        try {
          const result = await api.syncMessages(pendingApiMessages, groupData.syncState.lastSyncTimestamp) as MessageSyncResult;
          console.log('Message sync result for group', group.id, result);

          // Remove pending messages that were accepted and store synced versions
          const acceptedLocalIds = result.acceptedMessages.map(m => m.localId);
          if (acceptedLocalIds.length > 0) {
            await db.removePendingMessages(group.id, acceptedLocalIds);

            // Store the synced messages with server IDs
            const syncedMessages = result.acceptedMessages.map(accepted => {
              const pendingMessage = pendingMessages.find(m => m.id === accepted.localId);
              return {
                ...pendingMessage!,
                id: accepted.serverId,
                syncStatus: 'synced' as const,
              };
            });
            await db.storeMessages(group.id, syncedMessages);
          }

          const acceptedServerIds = result.acceptedMessages.map(m => m.serverId);
          const uniqueServerMessages = (result.serverMessages as Message[]).filter((m) => !acceptedServerIds.includes(m.id));
          if (uniqueServerMessages.length > 0) {
            await db.storeMessages(group.id, uniqueServerMessages);
          }

          // Store updated sync state after syncing pending messages
          await db.storeSyncState(group.id, {
            ...groupData.syncState,
            lastSyncTimestamp: result.syncTimestamp || new Date().toISOString(),
          });

          // Notify UI that messages were synced
          this.emitSyncComplete(group.id);

        } catch (error) {
          console.error('Failed to sync messages for group', group.id, error);

          // Mark failed messages
          const failedMessages = pendingMessages.map(message => ({
            ...message,
            syncStatus: 'failed' as const,
          }));
          await db.storeMessages(group.id, failedMessages);
        }
      }

      // Always fetch new server messages to ensure we get messages from other users
      // Use the original sync timestamp to avoid missing messages sent between sync operations
      try {
        const messagesResponse = await api.getGroupMessages(
          group.id,
          groupData.syncState.lastSyncTimestamp
        );

        if (messagesResponse.messages.length > 0) {
          console.log('Storing new messages from server:', messagesResponse.messages);
          await db.storeMessages(group.id, messagesResponse.messages);
          // Get the most recent sync state in case it was updated by pending message sync
          const latestGroupData = await db.getGroupData(group.id);
          await db.storeSyncState(group.id, {
            ...(latestGroupData?.syncState || groupData.syncState),
            lastSyncTimestamp: messagesResponse.syncTimestamp || new Date().toISOString(),
          });

          // Notify UI that new messages were fetched
          this.emitSyncComplete(group.id);
        }
      } catch (error) {
        console.error('Failed to fetch new messages for group', group.id, error);
      }
    }
  }
}

export const syncService = new SyncService();
