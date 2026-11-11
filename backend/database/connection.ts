import pg from 'pg';
import path from 'path';
import fs from 'fs';

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export interface DatabaseClient {
  query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;
}

export interface TransactionClient extends DatabaseClient {
  query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;
}

export function assertDatabaseConfiguredForRuntime(): void {
  if (
    process.env.NODE_ENV === 'production' &&
    !process.env.DATABASE_URL?.trim() &&
    process.env.ALLOW_EMBEDDED_DB_IN_PROD !== 'true'
  ) {
    throw new Error(
      '[Database] Fatal: DATABASE_URL is required in production. Refusing to boot on embedded PGlite.'
    );
  }
}

class DatabaseConnection {
  private pgPool: pg.Pool | null = null;
  private pgliteInstance: any = null;
  private isPGlite = false;

  public async getClient(): Promise<DatabaseClient> {
    assertDatabaseConfiguredForRuntime();
    if (this.pgPool) {
      return this.pgPool;
    }
    if (this.pgliteInstance) {
      return this.wrapPGlite(this.pgliteInstance);
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl && databaseUrl.trim() !== '') {
      const isLocal = databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1');
      const sslDisabled = process.env.DATABASE_SSL === 'disable' || isLocal;
      const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'true';
      this.pgPool = new pg.Pool({
        connectionString: databaseUrl,
        ssl: sslDisabled ? false : { rejectUnauthorized },
      });
      this.isPGlite = false;
      return this.pgPool;
    }

    const { PGlite } = await import('@electric-sql/pglite');

    if (process.env.NODE_ENV === 'test') {
      if (!(globalThis as any).__PHARMALINK_PGLITE__) {
        (globalThis as any).__PHARMALINK_PGLITE__ = new PGlite();
        await (globalThis as any).__PHARMALINK_PGLITE__.waitReady;
      }
      this.pgliteInstance = (globalThis as any).__PHARMALINK_PGLITE__;
      this.isPGlite = true;
      return this.wrapPGlite(this.pgliteInstance!);
    }

    // Default to embedded PGlite for zero-friction local/dev/serverless environment
    const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);
    const dataDir = isServerless
      ? path.resolve('/tmp', 'pglite')
      : path.resolve(process.env.PGLITE_DATA_DIR?.trim() || path.join(process.cwd(), 'data', 'pglite'));

    try {
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
    } catch {
      // Ignore read-only filesystem errors in restricted environments
    }

    const initPGlite = async (dir?: string) => {
      const instance = dir ? new PGlite(dir) : new PGlite();
      await instance.waitReady;
      return instance;
    };

    try {
      this.pgliteInstance = await initPGlite(dataDir);
    } catch (err) {
      if (!isServerless) {
        const lockFileExists = fs.existsSync(path.join(dataDir, 'postmaster.pid'));
        const detail = lockFileExists
          ? ' A PGlite lock file is present, but it may be stale after an abnormal shutdown. This file alone cannot confirm that another server is active.'
          : ' Check the directory permissions and database files.';
        console.error(`[Database] Persistent PGlite could not open ${dataDir}.${detail} Verify no other process is using the directory before recovery. You can set PGLITE_DATA_DIR to use a separate database directory.`, err);
        throw err;
      }
      console.warn('[Database] Persistent PGlite failed in serverless storage; falling back to in-memory mode:', err);
      try {
        this.pgliteInstance = await initPGlite();
      } catch (inMemErr) {
        console.error('[Database] In-memory PGlite failed:', inMemErr);
        throw inMemErr;
      }
    }

    this.isPGlite = true;
    return this.wrapPGlite(this.pgliteInstance);
  }

  public wrapPGlite(pglite: any): DatabaseClient & { exec: (sql: string) => Promise<any> } {
    return {
      query: async <T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> => {
        const res = await pglite.query(sql, params || []);
        const rows = (res.rows as T[]) || [];
        return {
          rows,
          rowCount: rows.length > 0 ? rows.length : (res.affectedRows ?? 0),
        };
      },
      exec: async (sql: string) => {
        return await pglite.exec(sql);
      },
    };
  }

  public async exec(sql: string): Promise<any> {
    if (this.pgPool) {
      return await this.pgPool.query(sql);
    }
    if (!this.pgliteInstance) {
      await this.getClient();
    }
    return await this.pgliteInstance!.exec(sql);
  }

  public async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    const client = await this.getClient();
    return client.query<T>(sql, params);
  }

  public async transaction<T>(callback: (client: TransactionClient) => Promise<T>): Promise<T> {
    if (this.pgPool) {
      const client = await this.pgPool.connect();
      try {
        await client.query('BEGIN');
        const txClient: TransactionClient = {
          query: async <R = any>(sql: string, params?: any[]) => {
            const res = await client.query(sql, params);
            return { rows: res.rows as R[], rowCount: res.rowCount ?? 0 };
          },
        };
        const result = await callback(txClient);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    // PGlite transaction
    if (!this.pgliteInstance) {
      await this.getClient();
    }
    const pglite = this.pgliteInstance!;
    return await pglite.transaction(async (tx: any) => {
      const txClient: TransactionClient = {
        query: async <R = any>(sql: string, params?: any[]) => {
          const res = await tx.query(sql, params || []);
          const rows = (res.rows as R[]) || [];
          return {
            rows,
            rowCount: rows.length > 0 ? rows.length : (res.affectedRows ?? 0),
          };
        },
      };
      return await callback(txClient);
    });
  }

  public async close(): Promise<void> {
    if (this.pgPool) {
      await this.pgPool.end();
      this.pgPool = null;
    }
    if (this.pgliteInstance) {
      await this.pgliteInstance.close();
      this.pgliteInstance = null;
    }
  }

  public async resetTestDatabase(): Promise<void> {
    if (this.pgliteInstance) {
      await this.pgliteInstance.close();
      this.pgliteInstance = null;
    }
    const { PGlite } = await import('@electric-sql/pglite');
    this.pgliteInstance = new PGlite();
    await this.pgliteInstance.waitReady;
    this.isPGlite = true;
  }

  /**
   * Acquires a PostgreSQL session advisory lock for cross-instance background jobs.
   * When running single-process embedded PGlite (dev/test), runs directly.
   */
  public async withAdvisoryLock<T>(
    lockKey: number,
    callback: () => Promise<T>
  ): Promise<{ acquired: boolean; result?: T }> {
    await this.getClient();
    if (!this.pgPool) {
      return { acquired: true, result: await callback() };
    }

    const client = await this.pgPool.connect();
    let acquired = false;
    try {
      const lockRes = await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock($1) AS locked',
        [lockKey]
      );
      acquired = Boolean(lockRes.rows[0]?.locked);
      if (!acquired) {
        return { acquired: false };
      }
      return { acquired: true, result: await callback() };
    } finally {
      if (acquired) {
        await client.query('SELECT pg_advisory_unlock($1)', [lockKey]).catch(() => undefined);
      }
      client.release();
    }
  }
}

export const db = new DatabaseConnection();
