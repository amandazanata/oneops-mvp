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

export { VersionConflictError } from "./repository.ts";

const DEMO_TIMESTAMP = "2026-08-19T10:00:00-03:00";

export class InMemoryOneOpsRepository implements OneOpsRepository {
  #state: ScenarioState | null = null;
  #results = new Map<string, ScenarioState>();

  async getOrInitialize(seed: ScheduleSnapshot): Promise<ScenarioState> {
    if (!this.#state) {
      this.#state = this.#initialState(seed);
    }
    return cloneState(this.#state);
  }

  async getCurrent(): Promise<ScenarioState> {
    if (!this.#state) {
      throw new RepositoryValidationError("O cenário ainda não foi inicializado.");
    }
    return cloneState(this.#state);
  }

  async createOrder(
    order: ServiceOrder,
    expectedVersion: number,
    idempotencyKey: string,
  ): Promise<ScenarioState> {
    const repeated = this.#results.get(idempotencyKey);
    if (repeated) return cloneState(repeated);
    const current = this.#requireVersion(expectedVersion);
    if (current.snapshot.orders.some(({ id }) => id === order.id)) {
      throw new RepositoryValidationError(`A ordem ${order.id} já existe.`);
    }
    const version = current.version + 1;
    return this.#commit(idempotencyKey, {
      ...current,
      version,
      mode: "AGENDA",
      snapshot: {
        ...current.snapshot,
        version,
        orders: [...current.snapshot.orders, cloneState(order)].sort((a, b) =>
          a.id.localeCompare(b.id)),
      },
    });
  }

  async saveSimulation(
    simulation: StoredSimulation,
    expectedVersion: number,
    idempotencyKey: string,
  ): Promise<ScenarioState> {
    const repeated = this.#results.get(idempotencyKey);
    if (repeated) return cloneState(repeated);
    const current = this.#requireVersion(expectedVersion);
    return this.#commit(idempotencyKey, {
      ...current,
      mode: "RECOVERY",
      simulation: cloneState(simulation),
    });
  }

  async applyPlan(
    planId: string,
    expectedVersion: number,
    idempotencyKey: string,
    actor: string,
  ): Promise<ApplyPlanResult> {
    const repeated = this.#results.get(idempotencyKey);
    if (repeated) return { state: cloneState(repeated), alreadyApplied: true };
    const current = this.#requireVersion(expectedVersion);
    const previousApplication = current.applications.find((entry) => entry.planId === planId);
    if (previousApplication) {
      return { state: cloneState(current), alreadyApplied: true };
    }
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
    const state = this.#commit(idempotencyKey, {
      ...current,
      version,
      mode: "APPLIED",
      snapshot: {
        ...cloneState(plan.schedule),
        generation: current.generation,
        version,
      },
      applications: [...current.applications, application],
      auditEntries: [...current.auditEntries, ...auditEntries],
    });
    return { state, alreadyApplied: false };
  }

  async reset(seed: ScheduleSnapshot, idempotencyKey: string): Promise<ScenarioState> {
    const repeated = this.#results.get(idempotencyKey);
    if (repeated) return cloneState(repeated);
    const current = this.#state;
    const generation = (current?.generation ?? 0) + 1;
    const version = (current?.version ?? 0) + 1;
    const state = {
      ...this.#initialState(seed),
      generation,
      version,
      snapshot: { ...cloneState(seed), generation, version },
    };
    return this.#commit(idempotencyKey, state);
  }

  #initialState(seed: ScheduleSnapshot): ScenarioState {
    return {
      generation: seed.generation,
      version: seed.version,
      seedHash: seedHash(seed),
      mode: "AGENDA",
      snapshot: cloneState(seed),
      simulation: null,
      applications: [],
      auditEntries: [],
    };
  }

  #requireVersion(expectedVersion: number): ScenarioState {
    if (!this.#state) throw new RepositoryValidationError("O cenário ainda não foi inicializado.");
    if (this.#state.version !== expectedVersion) {
      throw new VersionConflictError(expectedVersion, this.#state.version);
    }
    return this.#state;
  }

  #commit(idempotencyKey: string, state: ScenarioState): ScenarioState {
    this.#state = cloneState(state);
    this.#results.set(idempotencyKey, this.#state);
    return cloneState(this.#state);
  }
}
