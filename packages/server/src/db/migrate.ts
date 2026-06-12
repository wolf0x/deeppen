import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
}

const migrations: Migration[] = [
  {
    version: 1,
    name: "create_settings_table",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `);
    },
  },
  {
    version: 2,
    name: "create_chat_tables",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS chat_sessions (
          id TEXT PRIMARY KEY,
          model_config_id TEXT,
          title TEXT DEFAULT 'New Chat',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
      db.exec(`
        CREATE TABLE IF NOT EXISTS chat_messages (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )
      `);
    },
  },
  {
    version: 3,
    name: "add_user_context_to_tasks",
    up: (db) => {
      // Check if column exists before adding
      const columns = db.prepare("PRAGMA table_info(tasks)").all() as any[];
      const hasColumn = columns.some((c: any) => c.name === "user_context");
      if (!hasColumn) {
        db.exec("ALTER TABLE tasks ADD COLUMN user_context TEXT");
      }
    },
  },
  {
    version: 4,
    name: "add_task_type_to_tasks",
    up: (db) => {
      const columns = db.prepare("PRAGMA table_info(tasks)").all() as any[];
      const hasColumn = columns.some((c: any) => c.name === "task_type");
      if (!hasColumn) {
        db.exec("ALTER TABLE tasks ADD COLUMN task_type TEXT");
      }
    },
  },
  {
    version: 5,
    name: "create_stream_events_index",
    up: (db) => {
      db.exec("CREATE INDEX IF NOT EXISTS idx_stream_events_task_id ON stream_events(task_id)");
    },
  },
  {
    version: 6,
    name: "create_loop_tables",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS loop_sessions (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          goal TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          current_strategy TEXT,
          convergence_score INTEGER DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
      db.exec(`
        CREATE TABLE IF NOT EXISTS loop_iterations (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          iteration_num INTEGER NOT NULL,
          state_json TEXT,
          decision TEXT,
          action TEXT,
          guidance TEXT,
          result TEXT,
          created_at INTEGER NOT NULL
        )
      `);
      db.exec(`
        CREATE TABLE IF NOT EXISTS guidance_store (
          task_id TEXT PRIMARY KEY,
          guidance TEXT NOT NULL,
          iteration_num INTEGER DEFAULT 0,
          updated_at INTEGER NOT NULL
        )
      `);
    },
  },
  {
    version: 7,
    name: "add_seq_to_tasks",
    up: (db) => {
      const columns = db.prepare("PRAGMA table_info(tasks)").all() as any[];
      const hasColumn = columns.some((c: any) => c.name === "seq");
      if (!hasColumn) {
        db.exec("ALTER TABLE tasks ADD COLUMN seq INTEGER NOT NULL DEFAULT 0");
        // Backfill existing tasks with sequence numbers
        const rows = db.prepare("SELECT id FROM tasks ORDER BY created_at").all() as any[];
        const update = db.prepare("UPDATE tasks SET seq = ? WHERE id = ?");
        rows.forEach((row: any, i: number) => update.run(i + 1, row.id));
      }
    },
  },
];

export function runMigrations(dbPath: string): void {
  const db = new Database(dbPath);

  // Create migrations table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Get applied migrations
  const applied = db.prepare("SELECT version FROM migrations").all() as any[];
  const appliedVersions = new Set(applied.map((r: any) => r.version));

  // Run pending migrations
  let appliedCount = 0;
  for (const migration of migrations) {
    if (!appliedVersions.has(migration.version)) {
      try {
        console.log(`[Migrate] Running: ${migration.name} (v${migration.version})`);
        migration.up(db);
        db.prepare("INSERT INTO migrations (version, name) VALUES (?, ?)").run(migration.version, migration.name);
        appliedCount++;
        console.log(`[Migrate] ✓ ${migration.name}`);
      } catch (err: any) {
        console.error(`[Migrate] ✗ ${migration.name}: ${err.message}`);
      }
    }
  }

  if (appliedCount > 0) {
    console.log(`[Migrate] Applied ${appliedCount} migration(s)`);
  } else {
    console.log(`[Migrate] Database up to date`);
  }

  db.close();
}
