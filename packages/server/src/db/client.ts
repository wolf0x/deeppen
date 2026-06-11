import Database, { type Database as DatabaseType } from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import path from "node:path";
import fs from "node:fs";
import { runMigrations } from "./migrate.js";

const DB_PATH = process.env.DATABASE_URL ?? "./data/deeppen.db";

// Ensure directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// Run migrations before creating connection
runMigrations(DB_PATH);

const sqlite: DatabaseType = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { sqlite, type DatabaseType };
