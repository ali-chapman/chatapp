import pool from '../db';
import { Policy, Resolution } from './conflict';
import { User } from '../users/users';

export class ConflictService {
  public async getAllPolicies(): Promise<Policy[]> {
    const result = await pool.query(`
      SELECT p.id, p.policy_name, p.entity_type, p.conflict_type, 
             p.resolution_strategy, p.is_active, p.created_at, p.updated_at,
             u.id as creator_id, u.username, u.display_name
      FROM conflict_resolution_policies p
      JOIN users u ON p.created_by_admin_id = u.id
      ORDER BY p.created_at DESC
    `);

    return result.rows.map(this.getPolicyFromRow);
  }

  public async getAllResolutions(): Promise<Resolution[]> {
    // This would need actual resolution tracking table implementation
    // For now returning empty array as placeholder
    return [];
  }

  public async getPoliciesByEntityType(entityType: string): Promise<Policy[]> {
    const result = await pool.query(
      `SELECT p.id, p.policy_name, p.entity_type, p.conflict_type, 
             p.resolution_strategy, p.is_active, p.created_at, p.updated_at,
             u.id as creator_id, u.username, u.display_name
       FROM conflict_resolution_policies p
       JOIN users u ON p.created_by_admin_id = u.id
       WHERE p.entity_type = $1 AND p.is_active = true
       ORDER BY p.created_at DESC`,
      [entityType]
    );

    return result.rows.map(this.getPolicyFromRow);
  }

  public async getPolicyByConflictType(
    entityType: string,
    conflictType: string
  ): Promise<Policy | null> {
    const result = await pool.query(
      `SELECT p.id, p.policy_name, p.entity_type, p.conflict_type, 
             p.resolution_strategy, p.is_active, p.created_at, p.updated_at,
             u.id as creator_id, u.username, u.display_name
       FROM conflict_resolution_policies p
       JOIN users u ON p.created_by_admin_id = u.id
       WHERE p.entity_type = $1 AND p.conflict_type = $2 AND p.is_active = true
       LIMIT 1`,
      [entityType, conflictType]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.getPolicyFromRow(result.rows[0]);
  }

  private getPolicyFromRow(row: any): Policy {
    return {
      id: row.id,
      policyName: row.policy_name,
      entityType: row.entity_type,
      conflictType: row.conflict_type,
      resolutionStrategy: row.resolution_strategy,
      isActive: row.is_active,
      createdBy: {
        id: row.creator_id,
        username: row.username,
        displayName: row.display_name,
      } as User,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}