import { getDatabase } from '../../database/db';
import { Alert, AlertNote, AlertSeverity, AlertStatus, SurveillancePattern, SurveillanceSession } from '../types';
import { broadcastMarketData } from '../websocket';

export class SurveillanceService {
  /**
   * Vector Cosine Similarity
   */
  static cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length || vecA.length === 0) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Evaluate a Trading Window for Market Abuse Patterns
   */
  static async evaluateSessionWindow(params: {
    accountId: number;
    instrumentId: number;
    windowStart?: Date;
    windowEnd?: Date;
  }): Promise<{ session: SurveillanceSession; alert?: Alert; matchedPattern?: SurveillancePattern }> {
    const db = await getDatabase();

    const end = params.windowEnd || new Date();
    const start = params.windowStart || new Date(end.getTime() - 30 * 60 * 1000); // 30 min window

    // 1. Gather Order & Trade metrics for this account in this window
    const orderStatsRes = await db.query(
      `SELECT 
         COUNT(*)::INT AS total_orders,
         COUNT(*) FILTER (WHERE status = 'CANCELLED')::INT AS cancelled_orders,
         COALESCE(
           PERCENTILE_CONT(0.5) WITHIN GROUP (
             ORDER BY CASE 
               WHEN status = 'CANCELLED' AND cancel_requested_at IS NOT NULL 
               THEN EXTRACT(EPOCH FROM (cancel_requested_at - submitted_at)) * 1000 
               ELSE NULL 
             END
           ),
           250
         )::FLOAT AS median_lifetime_ms,
         COUNT(*) FILTER (WHERE side = 'BUY')::INT AS buy_orders,
         COUNT(*) FILTER (WHERE side = 'SELL')::INT AS sell_orders,
         COALESCE(SUM(quantity) FILTER (WHERE side = 'BUY'), 0)::BIGINT AS buy_qty,
         COALESCE(SUM(quantity) FILTER (WHERE side = 'SELL'), 0)::BIGINT AS sell_qty,
         COUNT(DISTINCT price) FILTER (WHERE status IN ('CANCELLED', 'OPEN', 'PARTIALLY_FILLED'))::INT AS distinct_price_levels
       FROM orders
       WHERE account_id = $1 AND instrument_id = $2
         AND submitted_at BETWEEN $3 AND $4`,
      [params.accountId, params.instrumentId, start.toISOString(), end.toISOString()]
    );

    const tradeStatsRes = await db.query(
      `SELECT COUNT(*)::INT AS executed_trades
       FROM trades
       WHERE (buyer_account_id = $1 OR seller_account_id = $1)
         AND instrument_id = $2
         AND executed_at BETWEEN $3 AND $4`,
      [params.accountId, params.instrumentId, start.toISOString(), end.toISOString()]
    );

    const fillStatsRes = await db.query(
      `SELECT 
         COUNT(*) FILTER (WHERE side = 'BUY')::INT AS buy_fills,
         COUNT(*) FILTER (WHERE side = 'SELL')::INT AS sell_fills,
         COUNT(*)::INT AS total_fills
       FROM fills
       WHERE account_id = $1 AND instrument_id = $2
         AND executed_at BETWEEN $3 AND $4`,
      [params.accountId, params.instrumentId, start.toISOString(), end.toISOString()]
    );

    const stats = orderStatsRes.rows[0];
    const tradeStats = tradeStatsRes.rows[0];
    const fillStats = fillStatsRes.rows[0];

    const ordersPlaced = stats.total_orders || 0;
    const ordersCanceled = stats.cancelled_orders || 0;
    const tradesExecuted = tradeStats.executed_trades || 0;

    // Feature 1: order_cancel_ratio
    const cancelRatio = ordersPlaced > 0 ? ordersCanceled / ordersPlaced : 0;

    // Feature 2: quote_to_trade_ratio
    const quoteToTrade = ordersPlaced === 0 ? 0 : (tradesExecuted > 0 ? ordersPlaced / tradesExecuted : ordersPlaced);

    // Feature 3: median_lifetime_ms (Statistical Median)
    const medianLifetime = stats.median_lifetime_ms !== null && stats.median_lifetime_ms !== undefined
      ? parseFloat(String(stats.median_lifetime_ms))
      : 250.0;

    // Feature 4: size_skew (Volume-weighted ratio)
    const buyVol = parseInt(stats.buy_qty, 10) || 0;
    const sellVol = parseInt(stats.sell_qty, 10) || 0;
    const totalVolume = buyVol + sellVol;
    const sizeSkew = totalVolume > 0 ? Math.abs(buyVol - sellVol) / totalVolume : 0;

    // Feature 5: msg_rate_per_s
    const windowSeconds = Math.max(1, (end.getTime() - start.getTime()) / 1000);
    const msgRate = (ordersPlaced + ordersCanceled) / windowSeconds;

    // Feature 6: book_imbalance_impact (derived from order quantity disparity; 0.0 if empty window)
    const totalOrderQty = (parseInt(stats.buy_qty, 10) + parseInt(stats.sell_qty, 10)) || 0;
    const bookImbalance = totalOrderQty > 0 
      ? Math.abs(parseInt(stats.buy_qty, 10) - parseInt(stats.sell_qty, 10)) / totalOrderQty 
      : 0.0;

    // Feature 7: opposite_side_fill_ratio (fills executed opposite to dominant quote side; 0.0 if no fills)
    const totalFills = fillStats.total_fills || 0;
    const dominantSide = stats.buy_orders >= stats.sell_orders ? 'BUY' : 'SELL';
    const oppFills = dominantSide === 'BUY' ? fillStats.sell_fills : fillStats.buy_fills;
    const oppFillRatio = totalFills > 0 
      ? oppFills / totalFills 
      : 0.0;

    // Feature 8: layering_depth (number of distinct price tiers populated; 0.0 if none)
    const layeringDepth = stats.distinct_price_levels > 0 
      ? stats.distinct_price_levels 
      : 0.0;

    const featureVector = [
      parseFloat(cancelRatio.toFixed(2)),
      parseFloat(quoteToTrade.toFixed(1)),
      parseFloat(medianLifetime.toFixed(1)),
      parseFloat(sizeSkew.toFixed(2)),
      parseFloat(msgRate.toFixed(1)),
      parseFloat(bookImbalance.toFixed(2)),
      parseFloat(oppFillRatio.toFixed(2)),
      parseFloat(layeringDepth.toFixed(1))
    ];

    // Diagnostic label
    let label = 'NORMAL_ACTIVITY';
    if (cancelRatio >= 0.85 && medianLifetime <= 200) {
      label = 'SUSPECTED_SPOOFING';
    } else if (layeringDepth >= 3.0 && cancelRatio >= 0.7) {
      label = 'SUSPECTED_LAYERING';
    } else if (msgRate >= 40) {
      label = 'SUSPECTED_QUOTE_STUFFING';
    }

    // 2. Insert Surveillance Session using atomic sequence
    const sessionRes = await db.query<SurveillanceSession>(
      `INSERT INTO surveillance_sessions (
         session_id, account_id, instrument_id, window_start, window_end,
         orders_placed, orders_canceled, trades_executed,
         order_cancel_ratio, quote_to_trade_ratio, median_lifetime_ms,
         size_skew, msg_rate_per_s, book_imbalance_impact, opposite_side_fill_ratio,
         layering_depth, features, label, created_at
       ) VALUES (nextval('surveillance_sessions_id_seq'), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
       RETURNING *`,
      [
        params.accountId,
        params.instrumentId,
        start.toISOString(),
        end.toISOString(),
        ordersPlaced,
        ordersCanceled,
        tradesExecuted,
        cancelRatio,
        quoteToTrade,
        medianLifetime,
        sizeSkew,
        msgRate,
        bookImbalance,
        oppFillRatio,
        layeringDepth,
        featureVector,
        label
      ]
    );
    const session = sessionRes.rows[0];

    // 3. Pattern Matching via Vector Cosine Similarity
    const patternsRes = await db.query<SurveillancePattern>('SELECT * FROM surveillance_patterns');
    let bestMatch: SurveillancePattern | null = null;
    let maxSim = 0;

    for (const pat of patternsRes.rows) {
      const sim = this.cosineSimilarity(featureVector, pat.embedding);
      if (sim > maxSim) {
        maxSim = sim;
        bestMatch = pat;
      }
    }

    let alert: Alert | undefined;

    // Trigger alert threshold (sim >= 0.85 and abnormal label)
    if (bestMatch && (maxSim >= 0.85 || label !== 'NORMAL_ACTIVITY')) {
      const severity: AlertSeverity = maxSim >= 0.95 ? 'CRITICAL' : maxSim >= 0.88 ? 'HIGH' : 'MEDIUM';
      const ruleFlags = [];
      if (cancelRatio >= 0.8) ruleFlags.push('HIGH_CANCEL_RATIO');
      if (medianLifetime <= 200) ruleFlags.push('ULTRA_SHORT_ORDER_LIFETIME');
      if (layeringDepth >= 2.5) ruleFlags.push('MULTI_LEVEL_LAYERING');
      if (msgRate >= 30) ruleFlags.push('HIGH_MESSAGE_VELOCITY');

      const alertRes = await db.query<Alert>(
        `INSERT INTO alerts (alert_id, session_id, pattern_id, similarity, rule_flags, severity, status, created_at)
         VALUES (nextval('alerts_id_seq'), $1, $2, $3, $4, $5, 'OPEN', NOW())
         RETURNING *`,
        [session.session_id, bestMatch.pattern_id, maxSim, ruleFlags, severity]
      );
      alert = alertRes.rows[0];

      // Broadcast real-time surveillance alert
      try {
        broadcastMarketData({
          type: 'SURVEILLANCE_ALERT',
          data: alert,
          timestamp: new Date().toISOString()
        });
      } catch (wsErr) {
        console.warn('[WS_BROADCAST] Surveillance alert broadcast error:', wsErr);
      }
    }

    return { session, alert, matchedPattern: bestMatch || undefined };
  }

  /**
   * Assign Alert to Analyst
   */
  static async assignAlert(alertId: number, analystId: number) {
    const db = await getDatabase();

    const userRes = await db.query(
      `SELECT user_id, role, is_active FROM users WHERE user_id = $1`,
      [analystId]
    );
    if (userRes.rows.length === 0) {
      throw new Error(`User with ID ${analystId} does not exist`);
    }
    const targetUser = userRes.rows[0];
    if (!targetUser.is_active) {
      throw new Error(`User ${analystId} is deactivated and cannot be assigned alerts`);
    }
    if (targetUser.role !== 'ANALYST' && targetUser.role !== 'ADMIN') {
      throw new Error(`User ${analystId} has role ${targetUser.role}; alerts can only be assigned to ANALYST or ADMIN`);
    }

    const res = await db.query<Alert>(
      `UPDATE alerts SET assigned_to = $1, status = 'IN_REVIEW' WHERE alert_id = $2 RETURNING *`,
      [analystId, alertId]
    );
    if (res.rows.length === 0) {
      throw new Error(`Alert with ID ${alertId} not found`);
    }
    return res.rows[0];
  }

  /**
   * Update Alert Status (OPEN, IN_REVIEW, RESOLVED, FALSE_POSITIVE)
   */
  static async updateAlertStatus(alertId: number, status: AlertStatus) {
    const db = await getDatabase();
    const resolvedClause = (status === 'RESOLVED' || status === 'FALSE_POSITIVE') ? ', resolved_at = NOW()' : '';
    const res = await db.query<Alert>(
      `UPDATE alerts SET status = $1 ${resolvedClause} WHERE alert_id = $2 RETURNING *`,
      [status, alertId]
    );
    return res.rows[0];
  }

  /**
   * Add Investigation Note using atomic sequence
   */
  static async addNote(alertId: number, authorId: number, body: string) {
    const db = await getDatabase();
    const res = await db.query<AlertNote>(
      `INSERT INTO alert_notes (note_id, alert_id, author_id, body, created_at)
       VALUES (nextval('alert_notes_id_seq'), $1, $2, $3, NOW())
       RETURNING note_id, alert_id, author_id, body, created_at`,
      [alertId, authorId, body]
    );
    return res.rows[0];
  }

  /**
   * Full-Text Search on Analyst Notes
   */
  static async searchNotes(queryText: string) {
    const db = await getDatabase();
    const res = await db.query(
      `SELECT n.note_id, n.alert_id, u.username AS author, n.body, n.created_at,
              ts_rank(n.body_tsv, plainto_tsquery('english', $1)) AS rank
       FROM alert_notes n
       JOIN users u ON u.user_id = n.author_id
       WHERE n.body_tsv @@ plainto_tsquery('english', $1)
       ORDER BY rank DESC`,
      [queryText]
    );
    return res.rows;
  }
}
