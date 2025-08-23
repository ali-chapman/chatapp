import pool from '../db';
import { User } from '../users/users';
import { Group, MembershipEvent } from './groups';
import { SyncStatus } from '../sync';

export type UnauthorizedError = 'UNAUTHORIZED';
export const UNAUTHORIZED: UnauthorizedError = 'UNAUTHORIZED';
export type GroupNotFoundError = 'GROUP_NOT_FOUND';
export const GROUP_NOT_FOUND: GroupNotFoundError = 'GROUP_NOT_FOUND';
export type UserNotInGroupError = 'USER_NOT_IN_GROUP';
export const USER_NOT_IN_GROUP: UserNotInGroupError = 'USER_NOT_IN_GROUP';
export type AlreadyMemberError = 'ALREADY_MEMBER';
export const ALREADY_MEMBER: AlreadyMemberError = 'ALREADY_MEMBER';

export class GroupService {
  public async getAllGroups(): Promise<Group[]> {
    const result = await pool.query(`
      SELECT g.id, g.name, g.description, g.created_at, g.updated_at, g.is_deleted,
             u.id as creator_id, u.username as creator_username, u.display_name as creator_display_name
      FROM chat_groups g
      JOIN users u ON g.created_by = u.id
      WHERE g.is_deleted = false
      ORDER BY g.created_at DESC
    `);

    return result.rows.map(this.getGroupFromRow);
  }

  public async createGroup(
    userId: string,
    name: string,
    description?: string
  ): Promise<Group> {
    const result = await pool.query(
      `INSERT INTO chat_groups (name, description, created_by)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name.trim(), description || '', userId]
    );

    const groupRow = result.rows[0];

    const userResult = await pool.query(
      `SELECT id, username, display_name FROM users WHERE id = $1`,
      [userId]
    );

    return {
      id: groupRow.id,
      entityType: 'GROUP',
      name: groupRow.name,
      description: groupRow.description,
      createdAt: groupRow.created_at,
      createdBy: {
        id: userResult.rows[0].id,
        username: userResult.rows[0].username,
        displayName: userResult.rows[0].display_name,
      } as User,
      updatedAt: groupRow.updated_at,
      isDeleted: groupRow.is_deleted,
    };
  }

  public async getGroupById(
    groupId: string
  ): Promise<Group | GroupNotFoundError> {
    const result = await pool.query(
      `SELECT g.id, g.name, g.description, g.created_at, g.updated_at, g.is_deleted,
             u.id as creator_id, u.username as creator_username, u.display_name as creator_display_name
      FROM chat_groups g
      JOIN users u ON g.created_by = u.id
      WHERE g.id = $1 AND g.is_deleted = false`,
      [groupId]
    );

    if (result.rows.length === 0) {
      return GROUP_NOT_FOUND;
    }

    return this.getGroupFromRow(result.rows[0]);
  }

  public async updateGroup(
    userId: string,
    groupId: string,
    name: string,
    description?: string
  ): Promise<Group | GroupNotFoundError | UnauthorizedError> {
    const checkResult = await pool.query(
      `SELECT created_by FROM chat_groups WHERE id = $1 AND is_deleted = false`,
      [groupId]
    );

    if (checkResult.rows.length === 0) {
      return GROUP_NOT_FOUND;
    }

    if (checkResult.rows[0].created_by !== userId) {
      return UNAUTHORIZED;
    }

    const result = await pool.query(
      `UPDATE chat_groups 
       SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND is_deleted = false
       RETURNING *`,
      [name.trim(), description || '', groupId]
    );

    const groupRow = result.rows[0];

    const userResult = await pool.query(
      `SELECT id, username, display_name FROM users WHERE id = $1`,
      [groupRow.created_by]
    );

    return {
      id: groupRow.id,
      entityType: 'GROUP',
      name: groupRow.name,
      description: groupRow.description,
      createdAt: groupRow.created_at,
      createdBy: {
        id: userResult.rows[0].id,
        username: userResult.rows[0].username,
        displayName: userResult.rows[0].display_name,
      } as User,
      updatedAt: groupRow.updated_at,
      isDeleted: groupRow.is_deleted,
    };
  }

  public async deleteGroup(
    userId: string,
    groupId: string
  ): Promise<void | GroupNotFoundError | UnauthorizedError> {
    const checkResult = await pool.query(
      `SELECT created_by FROM chat_groups WHERE id = $1 AND is_deleted = false`,
      [groupId]
    );

    if (checkResult.rows.length === 0) {
      return GROUP_NOT_FOUND;
    }

    if (checkResult.rows[0].created_by !== userId) {
      return UNAUTHORIZED;
    }

    await pool.query(
      `UPDATE chat_groups 
       SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [groupId]
    );
  }

  public async getGroupMembers(
    groupId: string
  ): Promise<any[] | GroupNotFoundError> {
    const groupResult = await pool.query(
      `SELECT id FROM chat_groups WHERE id = $1 AND is_deleted = false`,
      [groupId]
    );

    if (groupResult.rows.length === 0) {
      return GROUP_NOT_FOUND;
    }

    const result = await pool.query(
      `SELECT gm.user_id, u.username, u.display_name, gm.joined_at
       FROM group_memberships gm
       JOIN users u ON gm.user_id = u.id
       WHERE gm.group_id = $1 AND gm.is_active = true
       ORDER BY gm.joined_at ASC`,
      [groupId]
    );

    return result.rows.map((row) => ({
      userId: row.user_id,
      username: row.username,
      displayName: row.display_name,
      joinedAt: row.joined_at.toISOString(),
    }));
  }

  public async joinGroup(
    userId: string,
    groupId: string
  ): Promise<MembershipEvent | GroupNotFoundError | AlreadyMemberError> {
    const groupResult = await pool.query(
      `SELECT id FROM chat_groups WHERE id = $1 AND is_deleted = false`,
      [groupId]
    );

    if (groupResult.rows.length === 0) {
      return GROUP_NOT_FOUND;
    }

    const membershipResult = await pool.query(
      `SELECT id FROM group_memberships 
       WHERE user_id = $1 AND group_id = $2 AND is_active = true`,
      [userId, groupId]
    );

    if (membershipResult.rows.length > 0) {
      return ALREADY_MEMBER;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO group_memberships (user_id, group_id, joined_at, is_active)
         VALUES ($1, $2, CURRENT_TIMESTAMP, true)
         ON CONFLICT (user_id, group_id) 
         DO UPDATE SET is_active = true, joined_at = CURRENT_TIMESTAMP, left_at = NULL`,
        [userId, groupId]
      );

      const eventResult = await client.query(
        `INSERT INTO membership_events (user_id, group_id, action, performed_by, timestamp)
         VALUES ($1, $2, 'JOIN', $1, CURRENT_TIMESTAMP)
         RETURNING *`,
        [userId, groupId]
      );

      await client.query('COMMIT');

      return {
        id: eventResult.rows[0].id,
        groupId: eventResult.rows[0].group_id,
        userId: eventResult.rows[0].user_id,
        action: eventResult.rows[0].action,
        performedBy: { id: userId } as User,
        timestamp: eventResult.rows[0].timestamp,
        syncStatus: 'SYNCED' as SyncStatus,
        createdAt: eventResult.rows[0].created_at,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async removeUserFromGroup(
    currentUserId: string,
    groupId: string,
    userId: string
  ): Promise<
    void | GroupNotFoundError | UserNotInGroupError | UnauthorizedError
  > {
    const groupResult = await pool.query(
      `SELECT created_by FROM chat_groups WHERE id = $1 AND is_deleted = false`,
      [groupId]
    );

    if (groupResult.rows.length === 0) {
      return GROUP_NOT_FOUND;
    }

    const membershipResult = await pool.query(
      `SELECT id FROM group_memberships 
       WHERE user_id = $1 AND group_id = $2 AND is_active = true`,
      [userId, groupId]
    );

    if (membershipResult.rows.length === 0) {
      return USER_NOT_IN_GROUP;
    }

    const isGroupCreator = groupResult.rows[0].created_by === currentUserId;
    const isLeavingSelf = userId === currentUserId;

    if (!isLeavingSelf && !isGroupCreator) {
      return UNAUTHORIZED;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE group_memberships 
         SET is_active = false, left_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND group_id = $2`,
        [userId, groupId]
      );

      const action = isLeavingSelf ? 'LEAVE' : 'REMOVE';
      await client.query(
        `INSERT INTO membership_events (user_id, group_id, action, performed_by, timestamp)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
        [userId, groupId, action, currentUserId]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async getMembershipEvents(
    userId: string,
    groupId: string,
    since: string
  ): Promise<MembershipEvent[] | GroupNotFoundError | UnauthorizedError> {
    const groupResult = await pool.query(
      `SELECT id FROM chat_groups WHERE id = $1 AND is_deleted = false`,
      [groupId]
    );

    if (groupResult.rows.length === 0) {
      return GROUP_NOT_FOUND;
    }

    const membershipResult = await pool.query(
      `SELECT 1 FROM group_memberships 
       WHERE user_id = $1 AND group_id = $2 AND is_active = true`,
      [userId, groupId]
    );

    if (membershipResult.rows.length === 0) {
      return UNAUTHORIZED;
    }

    const result = await pool.query(
      `SELECT me.id, me.user_id, me.group_id, me.action, me.performed_by, me.timestamp,
              u1.username as user_username, u2.username as performed_by_username
       FROM membership_events me
       JOIN users u1 ON me.user_id = u1.id
       JOIN users u2 ON me.performed_by = u2.id
       WHERE me.group_id = $1 AND me.timestamp > $2
       ORDER BY me.timestamp ASC`,
      [groupId, new Date(since)]
    );

    return result.rows.map((row) => ({
      id: row.id,
      groupId: row.group_id,
      userId: row.user_id,
      action: row.action,
      performedBy: {
        id: row.performed_by,
        username: row.performed_by_username,
      } as User,
      timestamp: row.timestamp,
      syncStatus: 'SYNCED' as SyncStatus,
      createdAt: row.timestamp,
    }));
  }

  private getGroupFromRow(row: any): Group {
    return {
      id: row.id,
      entityType: 'GROUP',
      name: row.name,
      description: row.description,
      createdAt: row.created_at,
      createdBy: {
        id: row.creator_id,
        username: row.creator_username,
        displayName: row.creator_display_name,
      } as User,
      updatedAt: row.updated_at,
      isDeleted: row.is_deleted,
    };
  }
}

