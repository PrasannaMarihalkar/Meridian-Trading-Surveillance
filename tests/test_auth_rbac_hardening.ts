import http from 'http';
import assert from 'node:assert';
import { randomUUID } from 'crypto';
import { getDatabase } from '../database/db.js';
import { WebSocket } from 'ws';

process.env.NODE_ENV = 'test';

function makeRequest(
  options: http.RequestOptions,
  bodyData?: unknown
): Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed: any;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        resolve({ status: res.statusCode || 500, body: parsed, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (bodyData) {
      req.write(typeof bodyData === 'string' ? bodyData : JSON.stringify(bodyData));
    }
    req.end();
  });
}

async function run() {
  console.log('=== PHASE 1: AUTHENTICATION, SESSIONS, RBAC & WEBSOCKET HARDENING ===\n');

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    process.stdout.write(`[TEST] ${name} ... `);
    try {
      await fn();
      console.log('✓ PASSED');
      passed++;
    } catch (err: any) {
      console.log('✗ FAILED');
      console.error('      Error:', err.message || err);
      failed++;
    }
  }

  const { server } = await import('../backend/server.js');
  const port = await new Promise<number>((resolve) => {
    server.listen(0, () => {
      const addr = server.address() as any;
      resolve(addr.port);
    });
  });

  const db = await getDatabase();

  // Re-seed user password hashes for test predictability
  await db.query(
    `UPDATE users SET password_hash = '$2b$10$7QlrqW9o3nnVMyXBeI82WesAjib/ACpDAjyrykCtpMvZmDZFG.9DK', failed_logins = 0, locked_until = NULL`
  );

  // Test 1: Public Registration Role Restriction
  await test('Public registration rejects non-TRADER roles and defaults to TRADER', async () => {
    const adminAttempt = await makeRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email: 'hacker_admin@test.com',
      username: 'hacker_admin',
      password: 'Password123!',
      role: 'ADMIN'
    });
    assert.strictEqual(adminAttempt.status, 400, 'Public registration with role ADMIN must return 400');

    const analystAttempt = await makeRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email: 'hacker_analyst@test.com',
      username: 'hacker_analyst',
      password: 'Password123!',
      role: 'ANALYST'
    });
    assert.strictEqual(analystAttempt.status, 400, 'Public registration with role ANALYST must return 400');

    const validTrader = await makeRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email: `valid_trader_${Date.now()}@test.com`,
      username: `trader_${Date.now()}`,
      password: 'Password123!'
    });
    assert.strictEqual(validTrader.status, 201, 'Valid trader registration must return 201');
    assert.strictEqual(validTrader.body.user.role, 'TRADER');
    assert(validTrader.body.token, 'Must return JWT token');
  });

  // Test 2: Admin User Provisioning
  let adminToken = '';
  let traderToken = '';
  await test('Admin user provisioning endpoint (/api/auth/users) enforces strict RBAC', async () => {
    const adminLogin = await makeRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      identifier: 'sys_admin',
      password: 'Password123!'
    });
    assert.strictEqual(adminLogin.status, 200);
    adminToken = adminLogin.body.token;

    const traderLogin = await makeRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      identifier: 'prasanna_trader',
      password: 'Password123!'
    });
    assert.strictEqual(traderLogin.status, 200);
    traderToken = traderLogin.body.token;

    // Unauthenticated
    const unauth = await makeRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/auth/users',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email: 'new_analyst@test.com',
      username: 'new_analyst',
      password: 'Password123!',
      role: 'ANALYST'
    });
    assert.strictEqual(unauth.status, 401);

    // Trader forbidden
    const traderForbid = await makeRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/auth/users',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${traderToken}`
      }
    }, {
      email: 'new_analyst@test.com',
      username: 'new_analyst',
      password: 'Password123!',
      role: 'ANALYST'
    });
    assert.strictEqual(traderForbid.status, 403);

    // Admin success
    const uniqueUser = `analyst_${Date.now()}`;
    const adminSuccess = await makeRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/auth/users',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      }
    }, {
      email: `${uniqueUser}@meridian.internal`,
      username: uniqueUser,
      password: 'Password123!',
      role: 'ANALYST'
    });
    assert.strictEqual(adminSuccess.status, 201);
    assert.strictEqual(adminSuccess.body.user.role, 'ANALYST');
  });

  // Test 3: Session Lifecycle & Invalidation
  await test('Session lifecycle: Logout revokes session & user deactivation rejects token', async () => {
    const login = await makeRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      identifier: 'prasanna_trader',
      password: 'Password123!'
    });
    const token = login.body.token;

    // Verify authenticated
    const me1 = await makeRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/auth/me',
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(me1.status, 200);

    // Logout
    const logout = await makeRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/auth/logout',
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(logout.status, 200);

    // Token should now be rejected with 401
    const meAfter = await makeRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/auth/me',
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(meAfter.status, 401, 'Revoked session token must return 401');

    // Test Deactivation
    const login2 = await makeRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      identifier: 'rahul_marketmaker',
      password: 'Password123!'
    });
    const token2 = login2.body.token;
    const userId2 = login2.body.user.user_id;

    // Deactivate user in database
    await db.query('UPDATE users SET is_active = FALSE WHERE user_id = $1', [userId2]);

    const meDeact = await makeRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/auth/me',
      method: 'GET',
      headers: { Authorization: `Bearer ${token2}` }
    });
    assert.strictEqual(meDeact.status, 401, 'Token for deactivated user must return 401');

    // Re-activate
    await db.query('UPDATE users SET is_active = TRUE WHERE user_id = $1', [userId2]);
  });

  // Test 4: Order Cancellation RBAC
  await test('Order cancellation RBAC: Analyst cannot cancel trader order', async () => {
    const analystLogin = await makeRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      identifier: 'asha_analyst',
      password: 'Password123!'
    });
    const analystToken = analystLogin.body.token;

    // Trader places order below book to ensure it rests as OPEN
    const orderUuid = randomUUID();
    const placeRes = await makeRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/orders',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${traderToken}`,
        'Idempotency-Key': orderUuid
      }
    }, {
      accountId: 1001,
      instrumentId: 1,
      side: 'BUY',
      orderType: 'LIMIT',
      price: 1350.00,
      quantity: 5,
      clientOrderId: orderUuid
    });
    if (placeRes.status !== 201) {
      console.log('Order submission failed with body:', placeRes.body);
    }
    assert.strictEqual(placeRes.status, 201);
    const orderId = placeRes.body.order.order_id;

    // Analyst attempts to cancel -> MUST be 403 Forbidden!
    const analystCancel = await makeRequest({
      hostname: '127.0.0.1',
      port,
      path: `/api/orders/${orderId}/cancel`,
      method: 'POST',
      headers: { Authorization: `Bearer ${analystToken}` }
    });
    assert.strictEqual(analystCancel.status, 403, 'Analyst cancelling order must be rejected with 403');

    // Trader cancels own order -> 200 OK
    const traderCancel = await makeRequest({
      hostname: '127.0.0.1',
      port,
      path: `/api/orders/${orderId}/cancel`,
      method: 'POST',
      headers: { Authorization: `Bearer ${traderToken}` }
    });
    assert.strictEqual(traderCancel.status, 200);
  });

  // Test 5: Surveillance Routes RBAC & Assignment Validation
  await test('Surveillance routes require ANALYST or ADMIN role & validate assignment', async () => {
    // Trader accessing patterns -> 403
    const patTrader = await makeRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/surveillance/patterns',
      method: 'GET',
      headers: { Authorization: `Bearer ${traderToken}` }
    });
    assert.strictEqual(patTrader.status, 403);

    // Analyst accessing patterns -> 200
    const analystLogin = await makeRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      identifier: 'asha_analyst',
      password: 'Password123!'
    });
    const analystToken = analystLogin.body.token;

    const patAnalyst = await makeRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/surveillance/patterns',
      method: 'GET',
      headers: { Authorization: `Bearer ${analystToken}` }
    });
    assert.strictEqual(patAnalyst.status, 200);

    // Assign alert to invalid user -> 400
    const assignInvalid = await makeRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/surveillance/alerts/5001/assign',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${analystToken}`
      }
    }, {
      analystId: 999999
    });
    assert.strictEqual(assignInvalid.status, 400, 'Assigning alert to non-existent user must return 400');

    // Assign alert to trader user (non-analyst/admin) -> 400
    const assignTrader = await makeRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/surveillance/alerts/5001/assign',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${analystToken}`
      }
    }, {
      analystId: 101 // prasanna_trader (TRADER role)
    });
    assert.strictEqual(assignTrader.status, 400, 'Assigning alert to TRADER must return 400');
  });

  // Test 6: WebSocket Confidentiality
  await test('WebSocket confidentiality: TRADER never receives SURVEILLANCE_ALERT', async () => {
    const analystLogin = await makeRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      identifier: 'asha_analyst',
      password: 'Password123!'
    });
    const analystToken = analystLogin.body.token;

    const wsTrader = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${traderToken}`);
    const wsAnalyst = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${analystToken}`);

    await Promise.all([
      new Promise<void>((resolve) => wsTrader.on('open', () => resolve())),
      new Promise<void>((resolve) => wsAnalyst.on('open', () => resolve()))
    ]);

    let traderGotAlert = false;
    let analystGotAlert = false;

    wsTrader.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'SURVEILLANCE_ALERT') traderGotAlert = true;
      } catch {}
    });

    wsAnalyst.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'SURVEILLANCE_ALERT') analystGotAlert = true;
      } catch {}
    });

    const { broadcastSurveillanceAlert } = await import('../backend/websocket.js');
    broadcastSurveillanceAlert({ alertId: 99999, pattern: 'TEST_ALERT', severity: 'HIGH' });

    await new Promise((resolve) => setTimeout(resolve, 300));

    wsTrader.close();
    wsAnalyst.close();

    assert.strictEqual(traderGotAlert, false, 'Trader socket MUST NOT receive SURVEILLANCE_ALERT');
    assert.strictEqual(analystGotAlert, true, 'Analyst socket MUST receive SURVEILLANCE_ALERT');
  });

  console.log(`\n=== RESULTS: ${passed} PASSED, ${failed} FAILED ===\n`);
  server.close();
  await db.close();

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
