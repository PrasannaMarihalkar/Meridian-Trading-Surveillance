import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { getDatabase } from '../../database/db';
import { AuthTokenPayload, User, UserRole } from '../types';
import { JWT_SECRET } from '../middleware/auth';

export class AuthService {
  static async register(params: {
    email: string;
    username: string;
    password: string;
    role: UserRole;
  }): Promise<{ user: User; token: string; accountId?: number }> {
    const db = await getDatabase();

    // Check duplicate
    const existing = await db.query(
      'SELECT user_id FROM users WHERE email = $1 OR username = $2',
      [params.email.toLowerCase(), params.username]
    );

    if (existing.rows.length > 0) {
      throw new Error('User with this email or username already exists');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(params.password, salt);

    // Get next user_id
    const idRes = await db.query('SELECT COALESCE(MAX(user_id), 100) + 1 AS next_id FROM users');
    const nextUserId = parseInt(idRes.rows[0].next_id, 10);

    const userRes = await db.query<User>(
      `INSERT INTO users (user_id, email, username, password_hash, role, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, TRUE, NOW())
       RETURNING user_id, email, username, role, is_active, failed_logins, locked_until, last_login_at, created_at`,
      [nextUserId, params.email.toLowerCase(), params.username, passwordHash, params.role]
    );
    const newUser = userRes.rows[0];

    let accountId: number | undefined;

    // If TRADER, automatically provision trading account & default risk limits
    if (params.role === 'TRADER') {
      const accIdRes = await db.query('SELECT COALESCE(MAX(account_id), 1000) + 1 AS next_id FROM accounts');
      accountId = parseInt(accIdRes.rows[0].next_id, 10);

      await db.query(
        `INSERT INTO accounts (account_id, user_id, owner_role, cash_balance, created_at)
         VALUES ($1, $2, $3, 1000000.0000, NOW())`,
        [accountId, nextUserId, 'TRADER']
      );

      await db.query(
        `INSERT INTO risk_limits (account_id, max_order_qty, max_order_notional, max_position_qty, max_open_orders, price_collar_pct, updated_at)
         VALUES ($1, 1000, 2000000.0000, 5000, 25, 5.00, NOW())`,
        [accountId]
      );
    }

    const tokenPayload: AuthTokenPayload = {
      userId: newUser.user_id,
      username: newUser.username,
      email: newUser.email,
      role: newUser.role,
      accountId
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '12h' });

    // Record session
    await db.query(
      `INSERT INTO sessions (session_id, user_id, created_at, expires_at, ip_address, user_agent)
       VALUES ($1, $2, NOW(), NOW() + INTERVAL '12 hours', '127.0.0.1', 'MeridianClient/1.0')`,
      [randomUUID(), newUser.user_id]
    );

    return { user: newUser, token, accountId };
  }

  static async login(params: {
    identifier: string; // email or username
    password: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{ user: User; token: string; accountId?: number }> {
    const db = await getDatabase();

    const userRes = await db.query(
      `SELECT user_id, email, username, password_hash, role, is_active, failed_logins, locked_until, last_login_at, created_at
       FROM users
       WHERE LOWER(email) = LOWER($1) OR username = $1`,
      [params.identifier]
    );

    if (userRes.rows.length === 0) {
      throw new Error('Invalid email/username or password');
    }

    const user = userRes.rows[0];

    if (!user.is_active) {
      throw new Error('User account is deactivated');
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      throw new Error(`Account locked until ${new Date(user.locked_until).toISOString()} due to excessive failed attempts`);
    }

    const isValid = await bcrypt.compare(params.password, user.password_hash);

    if (!isValid) {
      const failedCount = (user.failed_logins || 0) + 1;
      let lockClause = '';
      const queryParams: (number | string)[] = [failedCount, user.user_id];

      if (failedCount >= 5) {
        lockClause = `, locked_until = NOW() + INTERVAL '15 minutes'`;
      }

      await db.query(
        `UPDATE users SET failed_logins = $1 ${lockClause} WHERE user_id = $2`,
        queryParams
      );

      throw new Error('Invalid email/username or password');
    }

    // Success: reset failed logins and update last_login_at
    await db.query(
      `UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = NOW() WHERE user_id = $1`,
      [user.user_id]
    );

    // Look up account_id if trader
    let accountId: number | undefined;
    if (user.role === 'TRADER') {
      const accRes = await db.query('SELECT account_id FROM accounts WHERE user_id = $1', [user.user_id]);
      if (accRes.rows.length > 0) {
        accountId = parseInt(accRes.rows[0].account_id, 10);
      }
    }

    const tokenPayload: AuthTokenPayload = {
      userId: user.user_id,
      username: user.username,
      email: user.email,
      role: user.role,
      accountId
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '12h' });

    // Store session record
    const sessionId = randomUUID();
    await db.query(
      `INSERT INTO sessions (session_id, user_id, created_at, expires_at, ip_address, user_agent)
       VALUES ($1, $2, NOW(), NOW() + INTERVAL '12 hours', $3, $4)`,
      [sessionId, user.user_id, params.ipAddress || '127.0.0.1', params.userAgent || 'Unknown']
    );

    delete user.password_hash;
    return { user: user as User, token, accountId };
  }

  static async getProfile(userId: number): Promise<User & { account?: Record<string, unknown> }> {
    const db = await getDatabase();
    const userRes = await db.query(
      `SELECT user_id, email, username, role, is_active, failed_logins, locked_until, last_login_at, created_at
       FROM users WHERE user_id = $1`,
      [userId]
    );

    if (userRes.rows.length === 0) {
      throw new Error('User not found');
    }

    const user = userRes.rows[0];

    const accRes = await db.query(
      `SELECT a.account_id, a.cash_balance, a.created_at,
              rl.max_order_qty, rl.max_order_notional, rl.max_position_qty, rl.max_open_orders, rl.price_collar_pct
       FROM accounts a
       LEFT JOIN risk_limits rl ON rl.account_id = a.account_id
       WHERE a.user_id = $1`,
      [userId]
    );

    return {
      ...user,
      account: accRes.rows[0] || null
    };
  }
}
