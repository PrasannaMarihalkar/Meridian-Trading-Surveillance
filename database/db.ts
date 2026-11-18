import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

export interface QueryResult<T = any> {
  rows: T[];
  rowCount?: number;
  fields?: { name: string; dataTypeID?: number }[];
}

export interface ITransactionClient {
  query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;
  exec(sql: string): Promise<void>;
}

export interface IDatabase {
  query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: ITransactionClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  isPGlite: boolean;
  pool?: pg.Pool;
}

let dbInstance: IDatabase | null = null;

export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
}

export async function getDatabase(): Promise<IDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl && !process.env.USE_PGLITE) {
    console.log('[DB] Connecting to PostgreSQL via standard connection string...');
    const pool = new pg.Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30000,
    });

    pool.on('error', (err) => {
      console.error('[DB] Unexpected error on idle client:', err.message);
    });

    // Test connection
    const testClient = await pool.connect();
    testClient.release();
    console.log('[DB] Connected to PostgreSQL successfully.');

    dbInstance = {
      isPGlite: false,
      pool,
      async query<T = any>(sql: string, params: any[] = []): Promise<QueryResult<T>> {
        const res = await pool.query(sql, params);
        return {
          rows: res.rows as T[],
          rowCount: res.rowCount ?? undefined,
          fields: res.fields?.map(f => ({ name: f.name, dataTypeID: f.dataTypeID })),
        };
      },
      async exec(sql: string): Promise<void> {
        await pool.query(sql);
      },
      /**
       * Execute an atomic transaction strictly bound to a single acquired PoolClient.
       * Guarantees that BEGIN, intermediate statements, COMMIT, and ROLLBACK execute
       * on the exact same PostgreSQL connection, preventing cross-statement pool interleaving.
       */
      async transaction<T>(fn: (tx: ITransactionClient) => Promise<T>): Promise<T> {
        const client = await pool.connect();
        let rollbackError: any = null;
        try {
          await client.query('BEGIN');
          const txClient: ITransactionClient = {
            async query<R = any>(sql: string, params: any[] = []): Promise<QueryResult<R>> {
              const res = await client.query(sql, params);
              return {
                rows: res.rows as R[],
                rowCount: res.rowCount ?? undefined,
                fields: res.fields?.map(f => ({ name: f.name, dataTypeID: f.dataTypeID })),
              };
            },
            async exec(sql: string): Promise<void> {
              await client.query(sql);
            }
          };
          const result = await fn(txClient);
          await client.query('COMMIT');
          return result;
        } catch (err) {
          try {
            await client.query('ROLLBACK');
          } catch (rbErr) {
            console.error('[DB] Rollback failed on connection:', rbErr);
            rollbackError = rbErr;
          }
          throw err;
        } finally {
          if (rollbackError) {
            client.release(rollbackError);
          } else {
            client.release();
          }
        }
      },
      async close(): Promise<void> {
        await pool.end();
      }
    };
  } else {
    // Embedded PGlite instance (either persisted or in-memory)
    const dataDir = process.env.PGLITE_DATA_DIR || path.join(process.cwd(), 'database', 'pgdata');
    console.log(`[DB] Initializing embedded PostgreSQL (PGlite) at ${dataDir}...`);

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const pglite = new PGlite(dataDir);
    await pglite.waitReady;
    console.log('[DB] Embedded PostgreSQL engine ready.');

    dbInstance = {
      isPGlite: true,
      async query<T = any>(sql: string, params: any[] = []): Promise<QueryResult<T>> {
        const res = await pglite.query(sql, params);
        return {
          rows: res.rows as T[],
          rowCount: res.rows.length,
          fields: res.fields?.map(f => ({ name: f.name, dataTypeID: f.dataTypeID })),
        };
      },
      async exec(sql: string): Promise<void> {
        await pglite.exec(sql);
      },
      /**
       * Transaction runner for PGlite embedded database.
       */
      async transaction<T>(fn: (tx: ITransactionClient) => Promise<T>): Promise<T> {
        return (pglite as any).transaction(async (pgTx: any) => {
          const txClient: ITransactionClient = {
            async query<R = any>(sql: string, params: any[] = []): Promise<QueryResult<R>> {
              const res = await pgTx.query(sql, params);
              return {
                rows: res.rows as R[],
                rowCount: res.rows.length,
                fields: res.fields?.map((f: any) => ({ name: f.name, dataTypeID: f.dataTypeID })),
              };
            },
            async exec(sql: string): Promise<void> {
              await pgTx.exec(sql);
            }
          };
          return await fn(txClient);
        });
      },
      async close(): Promise<void> {
        await pglite.close();
      }
    };
  }

  return dbInstance;
}
