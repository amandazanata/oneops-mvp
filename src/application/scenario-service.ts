import {
  createCarlosUnavailableEvent,
  createDemoFixture,
  createRecoveryFixture,
} from "../domain/fixture.ts";
import type { OperationalEvent, RecoveryResult, ScheduleSnapshot } from "../domain/types.ts";
import { validateSchedule } from "../planning/constraints.ts";
import { solveRecovery } from "../planning/solver.ts";
import {
  RepositoryValidationError,
  type OneOpsRepository,
  type ScenarioState,
} from "../persistence/repository.ts";

type Solver = (
  schedule: ScheduleSnapshot,
  event: OperationalEvent,
  deadlineMs?: number,
) => RecoveryResult;

export type ScenarioAction =
  | { readonly action: "CREATE_ORDER"; readonly expectedVersion: number; readonly idempotencyKey: string }
  | { readonly action: "SIMULATE_CARLOS"; readonly expectedVersion: number; readonly idempotencyKey: string }
  | { readonly action: "APPLY_RECOMMENDED"; readonly expectedVersion: number; readonly idempotencyKey: string }
  | { readonly action: "APPLY_CONSERVATIVE"; readonly expectedVersion: number; readonly idempotencyKey: string }
  | { readonly action: "RESET"; readonly idempotencyKey: string };

export interface ScenarioActionResult {
  readonly state: ScenarioState;
  readonly alreadyApplied?: boolean;
}

export class InvalidScenarioTransitionError extends Error {
  readonly code = "INVALID_TRANSITION";

  constructor(message: string) {
    super(message);
    this.name = "InvalidScenarioTransitionError";
  }
}

export class OneOpsScenarioService {
  readonly #repository: OneOpsRepository;
  readonly #solver: Solver;

  constructor(repository: OneOpsRepository, solver: Solver = solveRecovery) {
    this.#repository = repository;
    this.#solver = solver;
  }

  async getScenario(): Promise<ScenarioState> {
    return this.#repository.getOrInitialize(createDemoFixture());
  }

  async perform(command: ScenarioAction): Promise<ScenarioActionResult> {
    await this.getScenario();
    switch (command.action) {
      case "CREATE_ORDER": {
        const order = createRecoveryFixture().orders.find(({ id }) => id === "OS-106");
        if (!order) throw new RepositoryValidationError("A ordem revisada OS-106 não está disponível.");
        const state = await this.#repository.createOrder(
          order,
          command.expectedVersion,
          command.idempotencyKey,
        );
        return { state };
      }
      case "SIMULATE_CARLOS": {
        const current = await this.#repository.getCurrent();
        if (!current.snapshot.orders.some(({ id }) => id === "OS-106")) {
          throw new InvalidScenarioTransitionError(
            "Crie e revise a OS-106 antes de simular a indisponibilidade de Carlos.",
          );
        }
        const event = createCarlosUnavailableEvent();
        const result = this.#solver(current.snapshot, event, 1_500);
        const state = await this.#repository.saveSimulation(
          { event, result },
          command.expectedVersion,
          command.idempotencyKey,
        );
        return { state };
      }
      case "APPLY_RECOMMENDED":
      case "APPLY_CONSERVATIVE": {
        const current = await this.#repository.getCurrent();
        const plan = command.action === "APPLY_CONSERVATIVE"
          ? current.simulation?.result.conservative
          : current.simulation?.result.recommended;
        if (!plan) {
          throw new InvalidScenarioTransitionError("Não há plano selecionado para aprovação.");
        }
        const failures = validateSchedule(plan.schedule, current.simulation?.event ?? undefined);
        if (failures.length > 0) {
          const codes = [...new Set(failures.map(({ code }) => code))].join(", ");
          throw new RepositoryValidationError(
            `O plano falhou na revalidação das regras operacionais: ${codes}.`,
          );
        }
        return this.#repository.applyPlan(
          plan.id,
          command.expectedVersion,
          command.idempotencyKey,
          "Despachante Demo",
        );
      }
      case "RESET": {
        const state = await this.#repository.reset(createDemoFixture(), command.idempotencyKey);
        return { state };
      }
    }
  }
}
