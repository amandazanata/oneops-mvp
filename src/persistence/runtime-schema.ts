import type { D1DatabaseLike } from "./d1-repository.ts";

const statements = [
  `CREATE TABLE IF NOT EXISTS oneops_state (
    id integer PRIMARY KEY NOT NULL CHECK (id = 1),
    generation integer NOT NULL,
    version integer NOT NULL,
    seed_hash text NOT NULL,
    mode text NOT NULL,
    state_json text NOT NULL,
    updated_at text NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS state_mutations (
    idempotency_key text PRIMARY KEY NOT NULL,
    operation text NOT NULL,
    generation integer NOT NULL,
    expected_version integer NOT NULL,
    resulting_version integer NOT NULL,
    result_json text NOT NULL,
    created_at text NOT NULL
  )`,
  `CREATE TRIGGER IF NOT EXISTS state_mutations_guard
  BEFORE INSERT ON state_mutations
  BEGIN
    SELECT CASE WHEN NOT EXISTS (
      SELECT 1 FROM oneops_state
      WHERE id = 1
        AND generation = NEW.generation
        AND version = NEW.expected_version
    ) THEN RAISE(ABORT, 'ONEOPS_VERSION_CONFLICT') END;
  END`,
  `CREATE TABLE IF NOT EXISTS plan_applications (
    plan_id text PRIMARY KEY NOT NULL,
    generation integer NOT NULL,
    base_version integer NOT NULL,
    applied_version integer NOT NULL,
    idempotency_key text NOT NULL UNIQUE,
    actor text NOT NULL,
    result_json text NOT NULL,
    applied_at text NOT NULL
  )`,
  `CREATE TRIGGER IF NOT EXISTS plan_applications_guard
  BEFORE INSERT ON plan_applications
  BEGIN
    SELECT CASE WHEN NOT EXISTS (
      SELECT 1 FROM oneops_state
      WHERE id = 1
        AND generation = NEW.generation
        AND version = NEW.base_version
    ) THEN RAISE(ABORT, 'ONEOPS_VERSION_CONFLICT') END;
  END`,
  `CREATE TABLE IF NOT EXISTS audit_entries (
    id text PRIMARY KEY NOT NULL,
    generation integer NOT NULL,
    version integer NOT NULL,
    entity_id text NOT NULL,
    plan_id text NOT NULL,
    actor text NOT NULL,
    reason text NOT NULL,
    before_json text NOT NULL,
    after_json text NOT NULL,
    created_at text NOT NULL
  )`,
] as const;

const initializationByDatabase = new WeakMap<object, Promise<void>>();

export async function ensureOneOpsSchema(database: D1DatabaseLike): Promise<void> {
  const databaseKey = database as object;
  const existing = initializationByDatabase.get(databaseKey);
  if (existing) return existing;

  const initialization = database.batch(
    statements.map((sql) => database.prepare(sql)),
  ).then(() => undefined);
  initializationByDatabase.set(databaseKey, initialization);
  try {
    await initialization;
  } catch (error) {
    initializationByDatabase.delete(databaseKey);
    throw error;
  }
}
