import { PGlite } from '@electric-sql/pglite';
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

class DatabaseConnection {
  private pgPool: pg.Pool | null = null;
  private pgliteInstance: PGlite | null = null;
  private isPGlite = false;

  public async getClient(): Promise<DatabaseClient> {
    if (this.pgPool) {
      return this.pgPool;
    }
    if (this.pgliteInstance) {
      return this.wrapPGlite(this.pgliteInstance);
    }

    if (process.env.NODE_ENV === 'test') {
      if (!(globalThis as any).__PHARMALINK_PGLITE__) {
        (globalThis as any).__PHARMALINK_PGLITE__ = new PGlite();
        await (globalThis as any).__PHARMALINK_PGLITE__.waitReady;
      }
      this.pgliteInstance = (globalThis as any).__PHARMALINK_PGLITE__;
      this.isPGlite = true;
      return this.wrapPGlite(this.pgliteInstance!);
    }

    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl && databaseUrl.trim() !== '') {
      this.pgPool = new pg.Pool({
        connectionString: databaseUrl,
      });
      this.isPGlite = false;
      return this.pgPool;
    }

    // Default to embedded PGlite for zero-friction local/dev environment
    const dataDir = path.resolve(process.cwd(), 'data', 'pglite');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const initPGlite = async (dir?: string) => {
      if (dir) {
        // Remove stale postmaster lock/pid files that cause PGlite WASM aborts on unclean shutdown
        const pidFile = path.join(dir, 'postmaster.pid');
        if (fs.existsSync(pidFile)) {
          try { fs.unlinkSync(pidFile); } catch {}
        }
      }
      const instance = dir ? new PGlite(dir) : new PGlite();
      await instance.waitReady;
      return instance;
    };

    try {
      this.pgliteInstance = await initPGlite(dataDir);
    } catch (err) {
      console.warn('[Database] PGlite failed to initialize from disk, resetting data directory...', err);
      try {
        fs.rmSync(dataDir, { recursive: true, force: true });
        fs.mkdirSync(dataDir, { recursive: true });
        this.pgliteInstance = await initPGlite(dataDir);
      } catch (fallbackErr) {
        console.warn('[Database] Persistent PGlite failed, falling back to in-memory mode:', fallbackErr);
        this.pgliteInstance = await initPGlite();
      }
    }

    this.isPGlite = true;
    return this.wrapPGlite(this.pgliteInstance);
  }

  public wrapPGlite(pglite: PGlite): DatabaseClient & { exec: (sql: string) => Promise<any> } {
    return {
      query: async <T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> => {
        const res = await pglite.query<T>(sql, params || []);
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
    return await pglite.transaction(async (tx) => {
      const txClient: TransactionClient = {
        query: async <R = any>(sql: string, params?: any[]) => {
          const res = await tx.query<R>(sql, params || []);
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
    // In-memory PGlite for tests
    this.pgliteInstance = new PGlite();
    await this.pgliteInstance.waitReady;
    this.isPGlite = true;
  }
}

export const db = new DatabaseConnection();
