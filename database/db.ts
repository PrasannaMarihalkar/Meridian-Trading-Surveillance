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

export interface IDatabase {
  query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
  isPGlite: boolean;
}

let dbInstance: IDatabase | null = null;

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

    // Test connection
    const client = await pool.connect();
    client.release();
    console.log('[DB] Connected to PostgreSQL successfully.');

    dbInstance = {
      isPGlite: false,
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
      async close(): Promise<void> {
        await pglite.close();
      }
    };
  }

  return dbInstance;
}
