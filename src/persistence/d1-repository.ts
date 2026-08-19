import type { ScheduleSnapshot, ServiceOrder } from "../domain/types.ts";
import {
  cloneState,
  findPlan,
  RepositoryValidationError,
  seedHash,
  VersionConflictError,
  type ApplyPlanResult,
  type OneOpsRepository,
  type ScenarioState,
  type StoredSimulation,
} from "./repository.ts";
import { ensureOneOpsSchema } from "./runtime-schema.ts";

export interface D1StatementLike {
  bind(...values: unknown[]): D1StatementLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
}

export interface D1DatabaseLike {
  prepare(sql: string): D1StatementLike;
  batch<T = unknown>(statements: D1StatementLike[]): Promise<T[]>;
}

interface JsonRow {
  state_json: string;
}

interface ResultRow {
  result_json: string;
}

const DEMO_TIMESTAMP = "2026-08-19T10:00:00-03:00";

export class D1OneOpsRepository implements OneOpsRepository {
  readonly #database: D1DatabaseLike;

  constructor(database: D1DatabaseLike) {
    this.#database = database;
  }

  async getOrInitialize(seed: ScheduleSnapshot): Promise<ScenarioState> {
    await ensureOneOpsSchema(this.#database);
    const initial = this.#initialState(seed, seed.generation, seed.version);
    await this.#database.batch([
      this.#database.prepare(
        "INSERT OR IGNORE INTO oneops_state (id, generation, version, seed_hash, mode, state_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).bind(1, initial.generation, initial.version, initial.seedHash, initial.mode,
        JSON.stringify(initial), DEMO_TIMESTAMP),
    ]);
    return this.getCurrent();
  }

  async getCurrent(): Promise<ScenarioState> {
    const row = await this.#database.prepare(
      "SELECT state_json FROM oneops_state WHERE id = ?",
    ).bind(1).first<JsonRow>();
    if (!row) throw new RepositoryValidationError("O cenário ainda não foi inicializado.");
    return JSON.parse(row.state_json) as ScenarioState;
  }

  async createOrder(
    order: ServiceOrder,
    expectedVersion: number,
    idempotencyKey: string,
  ): Promise<ScenarioState> {
    const repeated = await this.#mutationResult(idempotencyKey);
    if (repeated) return repeated;
    const current = await this.#currentAtVersion(expectedVersion);
    if (current.snapshot.orders.some(({ id }) => id === order.id)) {
      throw new RepositoryValidationError(`A ordem ${order.id} já existe.`);
    }
    const version = current.version + 1;
    return this.#persistMutation("CREATE_ORDER", current, {
      ...current,
      version,
      mode: "AGENDA",
      snapshot: {
        ...current.snapshot,
        version,
        orders: [...current.snapshot.orders, cloneState(order)].sort((a, b) =>
          a.id.localeCompare(b.id)),
      },
    }, idempotencyKey);
  }

  async saveSimulation(
    simulation: StoredSimulation,
    expectedVersion: number,
    idempotencyKey: string,
  ): Promise<ScenarioState> {
    const repeated = await this.#mutationResult(idempotencyKey);
    if (repeated) return repeated;
    const current = await this.#currentAtVersion(expectedVersion);
    return this.#persistMutation("SIMULATE_CARLOS", current, {
      ...current,
      mode: "RECOVERY",
      simulation: cloneState(simulation),
    }, idempotencyKey);
  }

  async applyPlan(
    planId: string,
    expectedVersion: number,
    idempotencyKey: string,
    actor: string,
  ): Promise<ApplyPlanResult> {
    const previous = await this.#applicationResult(idempotencyKey, planId);
    if (previous) return { state: previous, alreadyApplied: true };
    const current = await this.#currentAtVersion(expectedVersion);
    const plan = findPlan(current, planId);
    if (plan.baseGeneration !== current.generation || plan.baseVersion !== current.version) {
      throw new VersionConflictError(plan.baseVersion, current.version);
    }
    if (plan.proofStatus !== "OPTIMAL" && plan.proofStatus !== "FEASIBLE") {
      throw new RepositoryValidationError("O plano não está em estado aprovável.");
    }
    const version = current.version + 1;
    const application = {
      planId,
      baseVersion: current.version,
      appliedVersion: version,
      idempotencyKey,
      actor,
      appliedAt: DEMO_TIMESTAMP,
    };
    const auditEntries = plan.changes.map((change, index) => ({
      id: `AUDIT-${current.generation}-${version}-${String(index + 1).padStart(2, "0")}`,
      entityId: change.orderId,
      planId,
      generation: current.generation,
      version,
      actor,
      reason: "Plano de recuperação aprovado",
      before: cloneState(change.before),
      after: cloneState(change.after),
      createdAt: DEMO_TIMESTAMP,
    }));
    const next: ScenarioState = {
      ...current,
      version,
      mode: "APPLIED",
      snapshot: { ...cloneState(plan.schedule), generation: current.generation, version },
      applications: [...current.applications, application],
      auditEntries: [...current.auditEntries, ...auditEntries],
    };
    const statements = [
      this.#database.prepare(
        "INSERT INTO plan_applications (plan_id, generation, base_version, applied_version, idempotency_key, actor, result_json, applied_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(planId, current.generation, current.version, version, idempotencyKey, actor,
        JSON.stringify(next), DEMO_TIMESTAMP),
      ...auditEntries.map((entry) => this.#database.prepare(
        "INSERT INTO audit_entries (id, generation, version, entity_id, plan_id, actor, reason, before_json, after_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).bind(entry.id, entry.generation, entry.version, entry.entityId, entry.planId,
        entry.actor, entry.reason, JSON.stringify(entry.before), JSON.stringify(entry.after), entry.createdAt)),
      this.#updateStateStatement(next),
    ];
    try {
      await this.#database.batch(statements);
      return { state: cloneState(next), alreadyApplied: false };
    } catch (error) {
      const duplicate = await this.#applicationResult(idempotencyKey, planId);
      if (duplicate) return { state: duplicate, alreadyApplied: true };
      return this.#throwConflictOr(error, expectedVersion);
    }
  }

  async reset(seed: ScheduleSnapshot, idempotencyKey: string): Promise<ScenarioState> {
    const repeated = await this.#mutationResult(idempotencyKey);
    if (repeated) return repeated;
    const current = await this.getCurrent();
    const next = this.#initialState(seed, current.generation + 1, current.version + 1);
    return this.#persistMutation("RESET", current, next, idempotencyKey);
  }

  async #persistMutation(
    operation: string,
    current: ScenarioState,
    next: ScenarioState,
    idempotencyKey: string,
  ): Promise<ScenarioState> {
    try {
      await this.#database.batch([
        this.#database.prepare(
          "INSERT INTO state_mutations (idempotency_key, operation, generation, expected_version, resulting_version, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ).bind(idempotencyKey, operation, current.generation, current.version, next.version,
          JSON.stringify(next), DEMO_TIMESTAMP),
        this.#updateStateStatement(next),
      ]);
      return cloneState(next);
    } catch (error) {
      const repeated = await this.#mutationResult(idempotencyKey);
      if (repeated) return repeated;
      return this.#throwConflictOr(error, current.version);
    }
  }

  #updateStateStatement(state: ScenarioState): D1StatementLike {
    return this.#database.prepare(
      "UPDATE oneops_state SET generation = ?, version = ?, seed_hash = ?, mode = ?, state_json = ?, updated_at = ? WHERE id = ?",
    ).bind(state.generation, state.version, state.seedHash, state.mode,
      JSON.stringify(state), DEMO_TIMESTAMP, 1);
  }

  async #currentAtVersion(expectedVersion: number): Promise<ScenarioState> {
    const current = await this.getCurrent();
    if (current.version !== expectedVersion) {
      throw new VersionConflictError(expectedVersion, current.version);
    }
    return current;
  }

  async #mutationResult(idempotencyKey: string): Promise<ScenarioState | null> {
    const row = await this.#database.prepare(
      "SELECT result_json FROM state_mutations WHERE idempotency_key = ?",
    ).bind(idempotencyKey).first<ResultRow>();
    return row ? JSON.parse(row.result_json) as ScenarioState : null;
  }

  async #applicationResult(idempotencyKey: string, planId: string): Promise<ScenarioState | null> {
    const row = await this.#database.prepare(
      "SELECT result_json FROM plan_applications WHERE idempotency_key = ? OR plan_id = ? LIMIT 1",
    ).bind(idempotencyKey, planId).first<ResultRow>();
    return row ? JSON.parse(row.result_json) as ScenarioState : null;
  }

  async #throwConflictOr(error: unknown, expectedVersion: number): Promise<never> {
    const current = await this.getCurrent();
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ONEOPS_VERSION_CONFLICT") || current.version !== expectedVersion) {
      throw new VersionConflictError(expectedVersion, current.version);
    }
    throw error;
  }

  #initialState(seed: ScheduleSnapshot, generation: number, version: number): ScenarioState {
    return {
      generation,
      version,
      seedHash: seedHash(seed),
      mode: "AGENDA",
      snapshot: { ...cloneState(seed), generation, version },
      simulation: null,
      applications: [],
      auditEntries: [],
    };
  }
}
