import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { migrateDatabase } from "./migrations.js";

export type SqliteDatabase = Database.Database;
export type AppDatabase = ReturnType<typeof createDrizzleDatabase>;

export interface DatabaseHandle {
  sqlite: SqliteDatabase;
  db: AppDatabase;
  close(): void;
}

export interface DatabaseDiagnostics {
  available: boolean;
  schemaVersion?: number;
  migrationCount?: number;
}

export function databasePath(stateDir: string): string {
  return join(stateDir, "devspace.sqlite");
}

export function openDatabase(stateDir: string): DatabaseHandle {
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  chmodSync(stateDir, 0o700);
  const path = databasePath(stateDir);
  const sqlite = new Database(path);
  try {
    chmodSync(path, 0o600);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("synchronous = NORMAL");
    sqlite.pragma("busy_timeout = 5000");
    sqlite.pragma("foreign_keys = ON");
    migrateDatabase(sqlite);

    return {
      sqlite,
      db: createDrizzleDatabase(sqlite),
      close: () => sqlite.close(),
    };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}

export function inspectDatabase(stateDir: string): DatabaseDiagnostics {
  let sqlite: Database.Database | undefined;
  try {
    sqlite = new Database(databasePath(stateDir), {
      readonly: true,
      fileMustExist: true,
    });
    const row = sqlite
      .prepare(
        `select
           coalesce(max(version), 0) as schema_version,
           count(*) as migration_count
         from devspace_schema_migrations`,
      )
      .get() as { schema_version: number; migration_count: number };
    return {
      available: true,
      schemaVersion: row.schema_version,
      migrationCount: row.migration_count,
    };
  } catch {
    return { available: false };
  } finally {
    sqlite?.close();
  }
}

function createDrizzleDatabase(sqlite: SqliteDatabase) {
  return drizzle(sqlite, { schema });
}
