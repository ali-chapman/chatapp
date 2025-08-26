import { randomUUID } from 'crypto';
import db from '../db';
import {
  PendingMembershipEvent,
  PendingMessage,
  PendingGroup,
  ResolvedConflict,
  MembershipSyncResponse,
  MessageSyncResponse,
  GroupSyncResponse,
} from './sync';

export class SyncService {
  private validateTimestamp(timestamp: string): Date {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      // If timestamp is invalid, use epoch (1970-01-01) to get all events
      return new Date(0);
    }
    return date;
  }

  public async syncMembershipEvents(
    userId: string,
    events: PendingMembershipEvent[],
    lastSyncTimestamp: string
  ): Promise<MembershipSyncResponse> {
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      const conflictsResolved: ResolvedConflict[] = [];
      const acceptedEvents: Array<{ localId: string; serverId: string }> = [];

      for (const event of events) {
        const { localId, groupId, action, timestamp } = event;

        if (action === 'JOIN') {
          const existingMembership = await client.query(
            'SELECT id FROM group_memberships WHERE user_id = $1 AND group_id = $2 AND is_active = true',
            [userId, groupId]
          );

          if (existingMembership.rows.length > 0) {
            const conflict: ResolvedConflict = {
              conflictId: randomUUID(),
              conflictType: 'DUPLICATE_JOIN',
              resolutionApplied: 'IGNORE_DUPLICATE',
              userMessage: 'You are already a member of this group',
              resolvedState: { action: 'ignored' },
            };
            conflictsResolved.push(conflict);
            continue;
          }

          const groupCheck = await client.query(
            'SELECT id FROM chat_groups WHERE id = $1 AND is_deleted = false',
            [groupId]
          );

          if (groupCheck.rows.length === 0) {
            throw new Error('Group not found or has been deleted');
          }
        }

        if (action === 'LEAVE') {
          const existingMembership = await client.query(
            'SELECT id FROM group_memberships WHERE user_id = $1 AND group_id = $2 AND is_active = true',
            [userId, groupId]
          );

          if (existingMembership.rows.length === 0) {
            const conflict: ResolvedConflict = {
              conflictId: randomUUID(),
              conflictType: 'DUPLICATE_LEAVE',
              resolutionApplied: 'IGNORE_DUPLICATE',
              userMessage: 'You are not a member of this group',
              resolvedState: { action: 'ignored' },
            };
            conflictsResolved.push(conflict);
            continue;
          }
        }

        const eventResult = await client.query(
          'INSERT INTO membership_events (user_id, group_id, action, performed_by, timestamp) VALUES ($1, $2, $3, $4, $5) RETURNING id',
          [userId, groupId, action, userId, this.validateTimestamp(timestamp)]
        );

        const eventId = eventResult.rows[0].id;
        acceptedEvents.push({ localId, serverId: eventId });

        if (action === 'JOIN') {
          await client.query(
            'INSERT INTO group_memberships (user_id, group_id, joined_at, is_active) VALUES ($1, $2, $3, true) ON CONFLICT (user_id, group_id) DO UPDATE SET is_active = true, joined_at = $3, left_at = NULL',
            [userId, groupId, this.validateTimestamp(timestamp)]
          );
        } else if (action === 'LEAVE') {
          await client.query(
            'UPDATE group_memberships SET is_active = false, left_at = $3 WHERE user_id = $1 AND group_id = $2',
            [userId, groupId, this.validateTimestamp(timestamp)]
          );
        }
      }

      const serverEventsResult = await client.query(
        `SELECT me.id, me.user_id, me.group_id, me.action, me.performed_by, me.timestamp, u.username
         FROM membership_events me
         JOIN users u ON me.user_id = u.id  
         WHERE me.timestamp > $1::timestamp
         AND (me.user_id = $2 OR me.group_id IN (
           SELECT group_id FROM group_memberships WHERE user_id = $2 AND is_active = true
         ))
         ORDER BY me.timestamp ASC`,
        [this.validateTimestamp(lastSyncTimestamp), userId]
      );

      const serverEvents = serverEventsResult.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        groupId: row.group_id,
        action: row.action,
        performedBy: row.performed_by,
        timestamp: row.timestamp.toISOString(),
      }));

      const syncTimestamp = new Date().toISOString();
      await client.query(
        'INSERT INTO user_sync_metadata (user_id, last_membership_sync) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET last_membership_sync = $2, updated_at = NOW()',
        [userId, syncTimestamp]
      );

      await client.query('COMMIT');

      return {
        conflictsResolved,
        serverEvents,
        syncTimestamp,
        acceptedEvents,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async syncMessages(
    userId: string,
    messages: PendingMessage[],
    lastSyncTimestamp: string
  ): Promise<MessageSyncResponse> {
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      const conflictsResolved: ResolvedConflict[] = [];
      const acceptedMessages: Array<{ localId: string; serverId: string }> = [];

      for (const message of messages) {
        const { localId, groupId, content, messageType, createdAt } = message;

        const membershipCheck = await client.query(
          'SELECT id FROM group_memberships WHERE user_id = $1 AND group_id = $2 AND is_active = true',
          [userId, groupId]
        );

        if (membershipCheck.rows.length === 0) {
          const conflict: ResolvedConflict = {
            conflictId: randomUUID(),
            conflictType: 'SEND_TO_LEFT_GROUP',
            resolutionApplied: 'REJECT_MESSAGE',
            userMessage: 'Cannot send message to a group you have left',
            resolvedState: { action: 'rejected' },
          };
          conflictsResolved.push(conflict);
          continue;
        }

        const groupCheck = await client.query(
          'SELECT id FROM chat_groups WHERE id = $1 AND is_deleted = false',
          [groupId]
        );

        if (groupCheck.rows.length === 0) {
          const conflict: ResolvedConflict = {
            conflictId: randomUUID(),
            conflictType: 'SEND_TO_DELETED_GROUP',
            resolutionApplied: 'REJECT_MESSAGE',
            userMessage: 'Cannot send message to a deleted group',
            resolvedState: { action: 'rejected' },
          };
          conflictsResolved.push(conflict);
          continue;
        }

        const duplicateCheck = await client.query(
          `SELECT id FROM messages 
           WHERE user_id = $1 AND group_id = $2 AND content = $3 
           AND created_at >= $4::timestamp - INTERVAL '1 minute' 
           AND created_at <= $4::timestamp + INTERVAL '1 minute'`,
          [userId, groupId, content, this.validateTimestamp(createdAt)]
        );

        if (duplicateCheck.rows.length > 0) {
          const conflict: ResolvedConflict = {
            conflictId: randomUUID(),
            conflictType: 'DUPLICATE_MESSAGE',
            resolutionApplied: 'DEDUPE_BY_CONTENT_AND_TIME',
            userMessage: 'Duplicate message detected and ignored',
            resolvedState: {
              action: 'deduplicated',
              existingMessageId: duplicateCheck.rows[0].id,
            },
          };
          conflictsResolved.push(conflict);
          acceptedMessages.push({
            localId,
            serverId: duplicateCheck.rows[0].id,
          });
          continue;
        }

        const messageResult = await client.query(
          'INSERT INTO messages (group_id, user_id, content, message_type, created_at, server_received_at, local_id) VALUES ($1, $2, $3, $4, $5, NOW(), $6) RETURNING id, group_id, local_id',
          [
            groupId,
            userId,
            content,
            messageType || 'text',
            this.validateTimestamp(createdAt),
            localId,
          ]
        );
        console.log('Inserted message:', messageResult.rows[0]);

        const messageId = messageResult.rows[0].id;
        acceptedMessages.push({ localId, serverId: messageId });
      }

      const serverMessagesResult = await client.query(
        `SELECT m.id, m.group_id, m.user_id, m.content, m.message_type, m.created_at, u.username
         FROM messages m
         JOIN users u ON m.user_id = u.id
         WHERE m.server_received_at > $1::timestamp
         AND m.group_id IN (
           SELECT group_id FROM group_memberships WHERE user_id = $2 AND is_active = true
         )
         AND m.is_deleted = false
         ORDER BY m.server_received_at ASC`,
        [this.validateTimestamp(lastSyncTimestamp), userId]
      );

      const serverMessages = serverMessagesResult.rows.map((row) => ({
        id: row.id,
        groupId: row.group_id,
        userId: row.user_id,
        username: row.username,
        content: row.content,
        messageType: row.message_type,
        createdAt: row.created_at.toISOString(),
        syncStatus: 'synced' as const,
      }));

      const syncTimestamp = new Date().toISOString();
      await client.query(
        'INSERT INTO user_sync_metadata (user_id, last_message_sync) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET last_message_sync = $2, updated_at = NOW()',
        [userId, syncTimestamp]
      );

      await client.query('COMMIT');

      const response = {
        conflictsResolved,
        serverMessages,
        syncTimestamp,
        acceptedMessages,
      };
      console.log('Message sync response:', response);
      return response;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async syncGroups(
    userId: string,
    groups: PendingGroup[],
    lastSyncTimestamp: string
  ): Promise<GroupSyncResponse> {
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      const conflictsResolved: ResolvedConflict[] = [];
      const acceptedGroups: Array<{ localId: string; serverId: string }> = [];

      for (const group of groups) {
        const { localId, name, description, createdAt } = group;

        // Check for duplicate group names (within same user's groups)
        const duplicateCheck = await client.query(
          `SELECT id FROM chat_groups 
           WHERE created_by = $1 AND name = $2 AND is_deleted = false`,
          [userId, name]
        );

        if (duplicateCheck.rows.length > 0) {
          const conflict: ResolvedConflict = {
            conflictId: randomUUID(),
            conflictType: 'DUPLICATE_GROUP_NAME',
            resolutionApplied: 'DEDUPE_BY_USER_AND_NAME',
            userMessage: 'A group with this name already exists',
            resolvedState: {
              action: 'deduplicated',
              existingGroupId: duplicateCheck.rows[0].id,
            },
          };
          conflictsResolved.push(conflict);
          acceptedGroups.push({
            localId,
            serverId: duplicateCheck.rows[0].id,
          });
          continue;
        }

        // Create the group
        const groupResult = await client.query(
          'INSERT INTO chat_groups (name, description, created_by, created_at, updated_at, is_deleted) VALUES ($1, $2, $3, $4, $4, false) RETURNING id',
          [name, description || '', userId, this.validateTimestamp(createdAt)]
        );

        const groupId = groupResult.rows[0].id;
        acceptedGroups.push({ localId, serverId: groupId });

        // Auto-join the creator to the group
        await client.query(
          'INSERT INTO group_memberships (user_id, group_id, joined_at, is_active) VALUES ($1, $2, $3, true)',
          [userId, groupId, this.validateTimestamp(createdAt)]
        );

        // Create membership event for the auto-join
        await client.query(
          'INSERT INTO membership_events (user_id, group_id, action, performed_by, timestamp) VALUES ($1, $2, $3, $4, $5)',
          [userId, groupId, 'JOIN', userId, this.validateTimestamp(createdAt)]
        );
      }

      // Fetch server groups that have been updated since last sync
      const serverGroupsResult = await client.query(
        `SELECT cg.id, cg.name, cg.description, cg.created_by, cg.created_at, cg.updated_at, cg.is_deleted,
                u.username as creator_username, u.display_name as creator_display_name, u.is_admin as creator_is_admin
         FROM chat_groups cg
         JOIN users u ON cg.created_by = u.id
         WHERE cg.updated_at > $1::timestamp
         AND (cg.created_by = $2 OR cg.id IN (
           SELECT group_id FROM group_memberships WHERE user_id = $2 AND is_active = true
         ))
         AND cg.is_deleted = false
         ORDER BY cg.updated_at ASC`,
        [this.validateTimestamp(lastSyncTimestamp), userId]
      );

      const serverGroups = serverGroupsResult.rows.map((row) => ({
        id: row.id,
        entityType: 'GROUP',
        name: row.name,
        description: row.description,
        createdBy: {
          id: row.created_by,
          username: row.creator_username,
          displayName: row.creator_display_name,
          isAdmin: row.creator_is_admin,
          createdAt: row.created_at.toISOString(),
        },
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
        isActive: !row.is_deleted,
        syncStatus: 'synced',
      }));

      const syncTimestamp = new Date().toISOString();
      await client.query(
        'INSERT INTO user_sync_metadata (user_id, last_group_sync) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET last_group_sync = $2, updated_at = NOW()',
        [userId, syncTimestamp]
      );

      await client.query('COMMIT');

      return {
        conflictsResolved,
        serverGroups,
        syncTimestamp,
        acceptedGroups,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
