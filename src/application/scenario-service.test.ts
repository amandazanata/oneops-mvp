import assert from "node:assert/strict";
import test from "node:test";

import type { RecoveryPlan, RecoveryResult, ScheduleSnapshot } from "../domain/types.ts";
import { InMemoryOneOpsRepository } from "../persistence/memory-repository.ts";
import { RepositoryValidationError } from "../persistence/repository.ts";
import { InvalidScenarioTransitionError, OneOpsScenarioService } from "./scenario-service.ts";

function fakeSolver(schedule: ScheduleSnapshot): RecoveryResult {
  const changedSchedule = {
    ...schedule,
    orders: schedule.orders.map((order) => {
      if (["OS-102", "OS-106"].includes(order.id)) {
        return { ...order, technicianIds: ["TECH-JOAO", "TECH-MARINA"] as const };
      }
      if (order.id === "OS-104") {
        return { ...order, technicianIds: ["TECH-MARINA"] as const };
      }
      if (order.id === "OS-105") return { ...order, start: "11:30", end: "13:00" };
      return order;
    }),
  };
  const before = schedule.orders.find(({ id }) => id === "OS-104");
  const after = changedSchedule.orders.find(({ id }) => id === "OS-104");
  assert.ok(before && after);
  const recommended: RecoveryPlan = {
    id: "PLAN-TEST",
    baseGeneration: schedule.generation,
    baseVersion: schedule.version,
    policy: "RECOMMENDED",
    proofStatus: "OPTIMAL",
    terminationReason: "EXHAUSTED",
    schedule: changedSchedule,
    changes: [{ orderId: "OS-104", before, after, direct: true }],
    metrics: {
      totalOrders: 6, preservedOrders: 6, cancellations: 0, reschedules: 0,
      impactedCustomers: 1, indirectChanges: 0, teamChanges: 1, timeChanges: 0,
      shiftedMinutes: 0, maximumShiftMinutes: 0, resourceChanges: 0,
      preferredPairLosses: 0, additionalTravelMinutes: 0, overtimeMinutes: 0,
      loadImbalanceMinutes: 0, confirmedChanges: 1, confirmedShiftedMinutes: 0,
      communicatedTimeChanges: 0, hardConstraintViolations: 0,
    },
    rankVector: [], conservativeRankVector: [], canonicalKey: "plan-test",
  };
  const conservative: RecoveryPlan = {
    ...recommended,
    id: "PLAN-CONSERVATIVE-TEST",
    policy: "CONSERVATIVE",
  };
  return {
    plans: [recommended, conservative], recommended, conservative, discardedAlternatives: [],
    impact: { directOrderIds: ["OS-104"], indirectOrderIds: [], nodes: [] },
    nodesVisited: 1, elapsedMs: 1, expansionLevel: 0,
    proofStatus: "OPTIMAL", terminationReason: "EXHAUSTED",
  };
}

test("state machine executes create, simulate, apply, and reset", async () => {
  const service = new OneOpsScenarioService(new InMemoryOneOpsRepository(), fakeSolver);

  const initial = await service.getScenario();
  const created = await service.perform({
    action: "CREATE_ORDER", expectedVersion: initial.version, idempotencyKey: "create",
  });
  const simulated = await service.perform({
    action: "SIMULATE_CARLOS", expectedVersion: created.state.version, idempotencyKey: "simulate",
  });
  const applied = await service.perform({
    action: "APPLY_CONSERVATIVE", expectedVersion: simulated.state.version, idempotencyKey: "apply",
  });
  const reset = await service.perform({ action: "RESET", idempotencyKey: "reset" });

  assert.equal(created.state.snapshot.orders.length, 6);
  assert.equal(simulated.state.mode, "RECOVERY");
  assert.equal(simulated.state.simulation?.result.recommended?.id, "PLAN-TEST");
  assert.equal(applied.state.mode, "APPLIED");
  assert.equal(applied.state.applications[0]?.planId, "PLAN-CONSERVATIVE-TEST");
  assert.equal(applied.state.snapshot.orders.find(({ id }) => id === "OS-104")?.technicianIds[0], "TECH-MARINA");
  assert.equal(reset.state.mode, "AGENDA");
  assert.equal(reset.state.snapshot.orders.length, 5);
  assert.equal(reset.state.generation, 2);
});

test("state machine refuses simulation before the reviewed sixth order exists", async () => {
  const service = new OneOpsScenarioService(new InMemoryOneOpsRepository(), fakeSolver);
  const initial = await service.getScenario();

  await assert.rejects(
    service.perform({
      action: "SIMULATE_CARLOS", expectedVersion: initial.version, idempotencyKey: "simulate",
    }),
    InvalidScenarioTransitionError,
  );
});

test("repeating APPLY_RECOMMENDED with the same key reports already applied", async () => {
  const service = new OneOpsScenarioService(new InMemoryOneOpsRepository(), fakeSolver);
  const initial = await service.getScenario();
  const created = await service.perform({
    action: "CREATE_ORDER", expectedVersion: initial.version, idempotencyKey: "create",
  });
  const simulated = await service.perform({
    action: "SIMULATE_CARLOS", expectedVersion: created.state.version, idempotencyKey: "simulate",
  });
  const first = await service.perform({
    action: "APPLY_RECOMMENDED", expectedVersion: simulated.state.version, idempotencyKey: "apply",
  });
  const repeated = await service.perform({
    action: "APPLY_RECOMMENDED", expectedVersion: simulated.state.version, idempotencyKey: "apply",
  });

  assert.equal(first.alreadyApplied, false);
  assert.equal(repeated.alreadyApplied, true);
  assert.equal(repeated.state.version, first.state.version);
});

test("revalidates the complete recommended schedule immediately before applying", async () => {
  const invalidSolver = (schedule: ScheduleSnapshot): RecoveryResult => {
    const result = fakeSolver(schedule);
    const invalid = { ...result.recommended!, schedule, changes: [] };
    return { ...result, plans: [invalid], recommended: invalid };
  };
  const service = new OneOpsScenarioService(new InMemoryOneOpsRepository(), invalidSolver);
  const initial = await service.getScenario();
  const created = await service.perform({
    action: "CREATE_ORDER", expectedVersion: initial.version, idempotencyKey: "create",
  });
  const simulated = await service.perform({
    action: "SIMULATE_CARLOS", expectedVersion: created.state.version, idempotencyKey: "simulate",
  });

  await assert.rejects(
    service.perform({
      action: "APPLY_RECOMMENDED", expectedVersion: simulated.state.version, idempotencyKey: "apply",
    }),
    RepositoryValidationError,
  );
});
