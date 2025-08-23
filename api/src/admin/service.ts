import pool from '../db';
import { ConflictPolicy, CreateConflictPolicyRequest } from './admin';

export type NotAdminError = 'NOT_ADMIN';
export const NOT_ADMIN: NotAdminError = 'NOT_ADMIN';
export type PolicyNotFoundError = 'POLICY_NOT_FOUND';
export const POLICY_NOT_FOUND: PolicyNotFoundError = 'POLICY_NOT_FOUND';

export class AdminService {
  public async checkAdminStatus(userId: string): Promise<boolean> {
    const result = await pool.query(
      'SELECT is_admin FROM users WHERE id = $1',
      [userId]
    );

    return result.rows.length > 0 && result.rows[0].is_admin;
  }

  public async getAllConflictPolicies(): Promise<ConflictPolicy[]> {
    const result = await pool.query(`
      SELECT id, policy_name, entity_type, conflict_type, resolution_strategy, 
             parameters, is_active, created_by_admin_id, created_at
      FROM conflict_resolution_policies
      ORDER BY created_at DESC
    `);

    return result.rows.map(this.getConflictPolicyFromRow);
  }

  public async createOrUpdateConflictPolicy(
    adminId: string,
    request: CreateConflictPolicyRequest
  ): Promise<ConflictPolicy> {
    const {
      policyName,
      entityType,
      conflictType,
      resolutionStrategy,
      parameters,
      isActive,
    } = request;

    const existingPolicy = await pool.query(
      'SELECT id FROM conflict_resolution_policies WHERE entity_type = $1 AND conflict_type = $2',
      [entityType, conflictType]
    );

    let result;
    if (existingPolicy.rows.length > 0) {
      result = await pool.query(
        `UPDATE conflict_resolution_policies 
         SET policy_name = $1, resolution_strategy = $2, parameters = $3, is_active = $4, 
             created_by_admin_id = $5, updated_at = CURRENT_TIMESTAMP
         WHERE entity_type = $6 AND conflict_type = $7
         RETURNING *`,
        [
          policyName,
          resolutionStrategy,
          JSON.stringify(parameters || {}),
          isActive !== false,
          adminId,
          entityType,
          conflictType,
        ]
      );
    } else {
      result = await pool.query(
        `INSERT INTO conflict_resolution_policies 
         (policy_name, entity_type, conflict_type, resolution_strategy, parameters, is_active, created_by_admin_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          policyName,
          entityType,
          conflictType,
          resolutionStrategy,
          JSON.stringify(parameters || {}),
          isActive !== false,
          adminId,
        ]
      );
    }

    return this.getConflictPolicyFromRow(result.rows[0]);
  }

  public async deleteConflictPolicy(
    policyId: string
  ): Promise<void | PolicyNotFoundError> {
    const result = await pool.query(
      'DELETE FROM conflict_resolution_policies WHERE id = $1 RETURNING id',
      [policyId]
    );

    if (result.rows.length === 0) {
      return POLICY_NOT_FOUND;
    }
  }

  private getConflictPolicyFromRow(row: any): ConflictPolicy {
    return {
      id: row.id,
      policyName: row.policy_name,
      entityType: row.entity_type,
      conflictType: row.conflict_type,
      resolutionStrategy: row.resolution_strategy,
      parameters: row.parameters,
      isActive: row.is_active,
      createdByAdminId: row.created_by_admin_id,
      createdAt: row.created_at,
    };
  }
}