import pool from '../db';
import { User, UserRegistration, UserLogin, AuthResponse } from './users';

export type UserNotFoundError = 'USER_NOT_FOUND';
export const USER_NOT_FOUND: UserNotFoundError = 'USER_NOT_FOUND';
export type UserAlreadyExistsError = 'USER_ALREADY_EXISTS';
export const USER_ALREADY_EXISTS: UserAlreadyExistsError = 'USER_ALREADY_EXISTS';
export type InvalidCredentialsError = 'INVALID_CREDENTIALS';
export const INVALID_CREDENTIALS: InvalidCredentialsError = 'INVALID_CREDENTIALS';

export class UserService {
  public async getAllUsers(): Promise<User[]> {
    const result = await pool.query(`
      SELECT id, username, display_name, is_admin, created_at
      FROM users
      ORDER BY created_at ASC
    `);

    return result.rows.map(this.getUserFromRow);
  }

  public async getCurrentUser(userId: string): Promise<User | UserNotFoundError> {
    const result = await pool.query(
      `SELECT id, username, display_name, is_admin, created_at
       FROM users
       WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return USER_NOT_FOUND;
    }

    return this.getUserFromRow(result.rows[0]);
  }

  public async getUserByUsername(username: string): Promise<User | UserNotFoundError> {
    const result = await pool.query(
      `SELECT id, username, display_name, is_admin, created_at
       FROM users
       WHERE username = $1`,
      [username]
    );

    if (result.rows.length === 0) {
      return USER_NOT_FOUND;
    }

    return this.getUserFromRow(result.rows[0]);
  }

  public async registerUser(
    registration: UserRegistration
  ): Promise<AuthResponse | UserAlreadyExistsError> {
    const { username, displayName, email, password } = registration;

    const existingUser = await pool.query(
      `SELECT id FROM users WHERE username = $1 OR email = $2`,
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      return USER_ALREADY_EXISTS;
    }

    const passwordHash = `$2b$10$hardcoded_hash_${password}`;

    const result = await pool.query(
      `INSERT INTO users (username, display_name, email, password_hash, is_admin)
       VALUES ($1, $2, $3, $4, false)
       RETURNING id, username, display_name, email, is_admin, created_at`,
      [username, displayName, email, passwordHash]
    );

    const userRow = result.rows[0];
    const user: User = this.getUserFromRow(userRow);

    const accessToken = `demo_access_token_${userRow.id}`;
    const refreshToken = `demo_refresh_token_${userRow.id}`;

    return {
      user,
      accessToken,
      refreshToken,
    };
  }

  public async loginUser(
    login: UserLogin
  ): Promise<AuthResponse | InvalidCredentialsError> {
    const { username, password } = login;

    const result = await pool.query(
      `SELECT id, username, display_name, email, password_hash, is_admin, created_at
       FROM users WHERE username = $1`,
      [username]
    );

    if (result.rows.length === 0) {
      return INVALID_CREDENTIALS;
    }

    const userRow = result.rows[0];
    
    const expectedHash = `$2b$10$hardcoded_hash_${password}`;
    if (userRow.password_hash !== expectedHash) {
      return INVALID_CREDENTIALS;
    }

    await pool.query(
      `UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [userRow.id]
    );

    const user: User = this.getUserFromRow(userRow);

    const accessToken = `demo_access_token_${userRow.id}`;
    const refreshToken = `demo_refresh_token_${userRow.id}`;

    return {
      user,
      accessToken,
      refreshToken,
    };
  }

  private getUserFromRow(row: any): User {
    return {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      email: row.email,
      createdAt: row.created_at.toISOString(),
      lastLoginAt: row.last_login_at?.toISOString(),
      updatedAt: row.updated_at?.toISOString(),
      isAdmin: row.is_admin,
    };
  }
}