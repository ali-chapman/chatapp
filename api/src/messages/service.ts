import pool from '../db';
import { User } from '../users/users';
import { Message } from './messages';

export type UnauthorizedError = 'UNAUTHORIZED';
export const UNAUTHORIZED: UnauthorizedError = 'UNAUTHORIZED';
export type GroupNotFoundError = 'GROUP_NOT_FOUND';
export const GROUP_NOT_FOUND: GroupNotFoundError = 'GROUP_NOT_FOUND';

type MessagesResult = {
  messages: Message[];
  hasMore: boolean;
  syncTimestamp: string;
};

export class MessageService {
  public async getMessagesForGroup(
    userId: string,
    groupId: string,
    since?: string,
    limit: number = 50
  ): Promise<MessagesResult | UnauthorizedError | GroupNotFoundError> {
    const canAccess = await this.checkUserCanAccessGroup(userId, groupId);
    if (!canAccess) {
      return UNAUTHORIZED;
    }

    const groupExists = await this.checkGroupExists(groupId);
    if (!groupExists) {
      return GROUP_NOT_FOUND;
    }

    let query = `
      SELECT m.id, m.group_id, m.content, m.message_type, m.created_at, m.updated_at, 
             m.sync_status, m.local_id, m.is_deleted, m.deleted_at,
             u.id as user_id, u.username, u.display_name
      FROM messages m
      JOIN users u ON m.user_id = u.id
      WHERE m.group_id = $1 AND m.is_deleted = false
    `;

    const queryParams: any[] = [groupId];
    let paramCount = 1;

    if (since) {
      paramCount++;
      query += ` AND m.server_received_at > $${paramCount}`;
      queryParams.push(since);
    }

    query += ` ORDER BY m.created_at DESC`;

    paramCount++;
    query += ` LIMIT $${paramCount}`;
    queryParams.push(limit);

    const result = await pool.query(query, queryParams);
    return {
      messages: result.rows.map(this.getMessageFromRow),
      hasMore: result.rows.length === limit,
      syncTimestamp: new Date().toISOString(),
    };
  }

  public async createMessage(
    userId: string,
    groupId: string,
    content: string,
    localId: string
  ): Promise<Message | UnauthorizedError | GroupNotFoundError> {
    const canAccess = await this.checkUserCanAccessGroup(userId, groupId);
    if (!canAccess) {
      return UNAUTHORIZED;
    }

    const groupExists = await this.checkGroupExists(groupId);

    if (!groupExists) {
      return GROUP_NOT_FOUND;
    }

    console.log('Creating new message');
    const result = await pool.query(
      `INSERT INTO messages (group_id, user_id, content, message_type, local_id, sync_status, server_received_at)
       VALUES ($1, $2, $3, 'text', $4, 'synced', NOW())
       RETURNING *`,
      [groupId, userId, content.trim(), localId || null]
    );

    console.log('Message rows returned:', result.rows);

    const messageRow = result.rows[0];

    // Get user info
    const userResult = await pool.query(
      `SELECT id, username, display_name FROM users WHERE id = $1`,
      [userId]
    );

    return this.getMessageFromRow({
      ...messageRow,
      user_id: userResult.rows[0].id,
      username: userResult.rows[0].username,
      display_name: userResult.rows[0].display_name,
    });
  }

  private async checkGroupExists(groupId: string): Promise<boolean> {
    const query = `
      SELECT id
      FROM chat_groups
      WHERE id = $1 AND is_deleted = false
      LIMIT 1
    `;
    const values = [groupId];
    const result = await pool.query(query, values);
    return result.rows.length === 1;
  }

  private async checkUserCanAccessGroup(
    userId: string,
    groupId: string
  ): Promise<boolean> {
    const query = `
      SELECT 1
      FROM group_memberships
      WHERE user_id = $1 AND group_id = $2 AND is_active = true
      LIMIT 1
    `;
    const values = [userId, groupId];
    const result = await pool.query(query, values);
    return result.rows.length > 0;
  }

  private getMessageFromRow(row: {
    id: string;
    local_id: string;
    group_id: string;
    user_id: string;
    username: string;
    display_name: string;
    content: string;
    message_type: 'text' | 'system';
    created_at: Date;
    updated_at: Date;
    sync_status: 'SYNCED' | 'PENDING' | 'FAILED';
    is_deleted: boolean;
    deleted_at?: Date | null;
  }): Message {
    return {
      id: row.id,
      entityType: 'MESSAGE',
      localId: row.local_id,
      groupId: row.group_id,
      user: {
        id: row.user_id,
        username: row.username,
        displayName: row.display_name,
      } as User,
      content: row.content,
      messageType: row.message_type,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      syncStatus: row.sync_status,
      isDeleted: row.is_deleted,
      ...(row.deleted_at && { deletedAt: row.deleted_at }),
    };
  }
}
