import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const oneOpsState = sqliteTable("oneops_state", {
  id: integer("id").primaryKey(),
  generation: integer("generation").notNull(),
  version: integer("version").notNull(),
  seedHash: text("seed_hash").notNull(),
  mode: text("mode").notNull(),
  stateJson: text("state_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const stateMutations = sqliteTable("state_mutations", {
  idempotencyKey: text("idempotency_key").primaryKey(),
  operation: text("operation").notNull(),
  generation: integer("generation").notNull(),
  expectedVersion: integer("expected_version").notNull(),
  resultingVersion: integer("resulting_version").notNull(),
  resultJson: text("result_json").notNull(),
  createdAt: text("created_at").notNull(),
});

export const planApplications = sqliteTable("plan_applications", {
  planId: text("plan_id").primaryKey(),
  generation: integer("generation").notNull(),
  baseVersion: integer("base_version").notNull(),
  appliedVersion: integer("applied_version").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  actor: text("actor").notNull(),
  resultJson: text("result_json").notNull(),
  appliedAt: text("applied_at").notNull(),
}, (table) => [uniqueIndex("plan_applications_idempotency_key_unique").on(table.idempotencyKey)]);

export const auditEntries = sqliteTable("audit_entries", {
  id: text("id").primaryKey(),
  generation: integer("generation").notNull(),
  version: integer("version").notNull(),
  entityId: text("entity_id").notNull(),
  planId: text("plan_id").notNull(),
  actor: text("actor").notNull(),
  reason: text("reason").notNull(),
  beforeJson: text("before_json").notNull(),
  afterJson: text("after_json").notNull(),
  createdAt: text("created_at").notNull(),
});
