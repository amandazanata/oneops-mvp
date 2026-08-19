import type {
  OperationalEvent,
  RecoveryPlan,
  RecoveryResult,
  ScheduleSnapshot,
  ServiceOrder,
} from "../domain/types.ts";

export type ScenarioMode = "AGENDA" | "RECOVERY" | "APPLIED";

export interface StoredSimulation {
  readonly event: OperationalEvent | null;
  readonly result: RecoveryResult;
}

export interface PlanApplication {
  readonly planId: string;
  readonly baseVersion: number;
  readonly appliedVersion: number;
  readonly idempotencyKey: string;
  readonly actor: string;
  readonly appliedAt: string;
}

export interface AuditEntry {
  readonly id: string;
  readonly entityId: string;
  readonly planId: string;
  readonly generation: number;
  readonly version: number;
  readonly actor: string;
  readonly reason: string;
  readonly before: ServiceOrder;
  readonly after: ServiceOrder;
  readonly createdAt: string;
}

export interface ScenarioState {
  readonly generation: number;
  readonly version: number;
  readonly seedHash: string;
  readonly mode: ScenarioMode;
  readonly snapshot: ScheduleSnapshot;
  readonly simulation: StoredSimulation | null;
  readonly applications: readonly PlanApplication[];
  readonly auditEntries: readonly AuditEntry[];
}

export interface ApplyPlanResult {
  readonly state: ScenarioState;
  readonly alreadyApplied: boolean;
}

export interface OneOpsRepository {
  getOrInitialize(seed: ScheduleSnapshot): Promise<ScenarioState>;
  getCurrent(): Promise<ScenarioState>;
  createOrder(
    order: ServiceOrder,
    expectedVersion: number,
    idempotencyKey: string,
  ): Promise<ScenarioState>;
  saveSimulation(
    simulation: StoredSimulation,
    expectedVersion: number,
    idempotencyKey: string,
  ): Promise<ScenarioState>;
  applyPlan(
    planId: string,
    expectedVersion: number,
    idempotencyKey: string,
    actor: string,
  ): Promise<ApplyPlanResult>;
  reset(seed: ScheduleSnapshot, idempotencyKey: string): Promise<ScenarioState>;
}

export class VersionConflictError extends Error {
  readonly code = "VERSION_CONFLICT";
  readonly expectedVersion: number;
  readonly actualVersion: number;

  constructor(expectedVersion: number, actualVersion: number) {
    super(`A agenda mudou: versão esperada ${expectedVersion}, versão atual ${actualVersion}.`);
    this.name = "VersionConflictError";
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

export class RepositoryValidationError extends Error {
  readonly code = "VALIDATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "RepositoryValidationError";
  }
}

export function seedHash(seed: ScheduleSnapshot): string {
  const source = JSON.stringify(seed);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function cloneState<T>(value: T): T {
  return structuredClone(value);
}

export function findPlan(state: ScenarioState, planId: string): RecoveryPlan {
  const plan = state.simulation?.result.plans.find(({ id }) => id === planId);
  if (!plan) throw new RepositoryValidationError(`Plano ${planId} não encontrado.`);
  return plan;
}
