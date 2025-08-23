import { randomUUID } from 'crypto';
import db from '../db';
import {
  PendingMembershipEvent,
  PendingMessage,
  ResolvedConflict,
  MembershipSyncResponse,
  MessageSyncResponse,
} from './sync';

export class SyncService {
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
          [userId, groupId, action, userId, new Date(timestamp)]
        );

        const eventId = eventResult.rows[0].id;
        acceptedEvents.push({ localId, serverId: eventId });

        if (action === 'JOIN') {
          await client.query(
            'INSERT INTO group_memberships (user_id, group_id, joined_at, is_active) VALUES ($1, $2, $3, true) ON CONFLICT (user_id, group_id) DO UPDATE SET is_active = true, joined_at = $3, left_at = NULL',
            [userId, groupId, new Date(timestamp)]
          );
        } else if (action === 'LEAVE') {
          await client.query(
            'UPDATE group_memberships SET is_active = false, left_at = $3 WHERE user_id = $1 AND group_id = $2',
            [userId, groupId, new Date(timestamp)]
          );
        }
      }

      const serverEventsResult = await client.query(
        `SELECT me.id, me.user_id, me.group_id, me.action, me.performed_by, me.timestamp, u.username
         FROM membership_events me
         JOIN users u ON me.user_id = u.id  
         WHERE me.timestamp > $1
         AND (me.user_id = $2 OR me.group_id IN (
           SELECT group_id FROM group_memberships WHERE user_id = $2 AND is_active = true
         ))
         ORDER BY me.timestamp ASC`,
        [new Date(lastSyncTimestamp), userId]
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
           AND created_at >= $4 - INTERVAL '1 minute' 
           AND created_at <= $4 + INTERVAL '1 minute'`,
          [userId, groupId, content, new Date(createdAt)]
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
          'INSERT INTO messages (group_id, user_id, content, message_type, created_at, local_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
          [
            groupId,
            userId,
            content,
            messageType || 'text',
            new Date(createdAt),
            localId,
          ]
        );

        const messageId = messageResult.rows[0].id;
        acceptedMessages.push({ localId, serverId: messageId });
      }

      const serverMessagesResult = await client.query(
        `SELECT m.id, m.group_id, m.user_id, m.content, m.message_type, m.created_at, u.username
         FROM messages m
         JOIN users u ON m.user_id = u.id
         WHERE m.created_at > $1
         AND m.group_id IN (
           SELECT group_id FROM group_memberships WHERE user_id = $2 AND is_active = true
         )
         AND m.is_deleted = false
         ORDER BY m.created_at ASC`,
        [new Date(lastSyncTimestamp), userId]
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

      return {
        conflictsResolved,
        serverMessages,
        syncTimestamp,
        acceptedMessages,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}