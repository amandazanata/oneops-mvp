import assert from "node:assert/strict";
import test from "node:test";

import {
  createCarlosUnavailableEvent,
  createExceptionStockShortageFixture,
  createRecoveryFixture,
} from "../domain/fixture.ts";
import type { RecoveryPlan } from "../domain/types.ts";
import { validateSchedule } from "./constraints.ts";
import { solveExceptionRecovery, solveRecovery } from "./solver.ts";

const slot = (plan: RecoveryPlan, id: string): readonly [string, string] => {
  const order = plan.schedule.orders.find((item) => item.id === id);
  assert.ok(order);
  return [order.start, order.end];
};

test("returns the two distinct, complete deterministic fixture plans", () => {
  const schedule = createRecoveryFixture();
  const event = createCarlosUnavailableEvent();
  const result = solveRecovery(schedule, event, 1_500);

  assert.equal(result.proofStatus, "OPTIMAL");
  assert.equal(result.terminationReason, "EXHAUSTED");
  assert.equal(result.plans.length, 2);
  assert.ok(result.recommended);
  assert.ok(result.conservative);
  assert.match(result.recommended.id, /^PLAN-G1-RECOMMENDED-/);
  assert.match(result.conservative.id, /^PLAN-G1-CONSERVATIVE-/);
  assert.notEqual(result.recommended.canonicalKey, result.conservative.canonicalKey);
  assert.deepEqual(result.impact.directOrderIds, ["OS-102", "OS-104", "OS-106"]);
  assert.deepEqual(result.impact.indirectOrderIds, ["OS-105"]);

  assert.deepEqual(slot(result.recommended, "OS-105"), ["11:30", "13:00"]);
  assert.deepEqual(slot(result.recommended, "OS-106"), ["15:30", "17:30"]);
  assert.deepEqual(slot(result.conservative, "OS-105"), ["14:00", "15:30"]);
  assert.deepEqual(slot(result.conservative, "OS-106"), ["16:00", "18:00"]);

  assert.equal(result.recommended.metrics.preservedOrders, 6);
  assert.equal(result.recommended.metrics.impactedCustomers, 4);
  assert.equal(result.recommended.metrics.teamChanges, 3);
  assert.equal(result.recommended.metrics.timeChanges, 1);
  assert.equal(result.recommended.metrics.shiftedMinutes, 240);
  assert.equal(result.recommended.metrics.hardConstraintViolations, 0);
  assert.deepEqual(validateSchedule(result.recommended.schedule, event), []);
  assert.deepEqual(validateSchedule(result.conservative.schedule, event), []);
});

test("scopes plan ids to the scenario generation", () => {
  const firstSchedule = createRecoveryFixture();
  const secondSchedule = { ...firstSchedule, generation: firstSchedule.generation + 1 };
  const event = createCarlosUnavailableEvent();
  const first = solveRecovery(firstSchedule, event);
  const second = solveRecovery(secondSchedule, event);

  assert.notEqual(first.recommended?.id, second.recommended?.id);
  assert.notEqual(first.conservative?.id, second.conservative?.id);
});

test("records objective rejection facts and never exposes them as approvable plans", () => {
  const result = solveRecovery(
    createRecoveryFixture(),
    createCarlosUnavailableEvent(),
  );
  const allCodes = result.discardedAlternatives.flatMap(({ failures }) =>
    failures.map(({ code }) => code),
  );

  assert.ok(allCodes.includes("MISSING_SKILL"));
  assert.ok(allCodes.includes("MISSING_CERTIFICATION"));
  assert.ok(allCodes.includes("TECHNICIAN_OVERLAP"));
  assert.ok(allCodes.includes("TRAVEL_TIME"));
  assert.ok(allCodes.includes("VEHICLE_COLLISION"));
  assert.ok(allCodes.includes("TOOL_COLLISION"));
  assert.ok(
    result.discardedAlternatives.every(({ id }) =>
      result.plans.every((plan) => plan.id !== id)),
  );
});

test("is reproducible across runs and finishes the fixture under two seconds", () => {
  const schedule = createRecoveryFixture();
  const event = createCarlosUnavailableEvent();
  const startedAt = performance.now();
  const first = solveRecovery(schedule, event, 1_500);
  const second = solveRecovery(schedule, event, 1_500);
  const elapsed = performance.now() - startedAt;

  assert.ok(elapsed < 2_000, `duas execuções levaram ${elapsed.toFixed(1)} ms`);
  assert.deepEqual(
    first.plans.map(({ id, rankVector }) => ({ id, rankVector })),
    second.plans.map(({ id, rankVector }) => ({ id, rankVector })),
  );
});

test("reports a time-limited solution as feasible, never optimal", () => {
  const result = solveRecovery(
    createRecoveryFixture(),
    createCarlosUnavailableEvent(),
    0,
  );

  assert.ok(result.plans.length > 0);
  assert.equal(result.proofStatus, "FEASIBLE");
  assert.equal(result.terminationReason, "TIME_LIMIT");
  assert.ok(result.plans.every(({ proofStatus }) => proofStatus === "FEASIBLE"));
});

test("proves same-day infeasibility for the stock-shortage preset", () => {
  const result = solveRecovery(
    createExceptionStockShortageFixture(),
    createCarlosUnavailableEvent(),
  );

  assert.equal(result.plans.length, 0);
  assert.equal(result.proofStatus, "INFEASIBLE");
  assert.equal(result.terminationReason, "EXHAUSTED");
  assert.ok(
    result.discardedAlternatives.some(({ failures }) =>
      failures.some(({ code }) => code === "PART_STOCK")),
  );
});

test("exception planner proposes OS-106 on the next day without claiming normal optimality", () => {
  const result = solveExceptionRecovery(
    createExceptionStockShortageFixture(),
    createCarlosUnavailableEvent(),
  );
  const plan = result.plans[0];
  const os106 = plan?.schedule.orders.find(({ id }) => id === "OS-106");

  assert.equal(result.proofStatus, "FEASIBLE");
  assert.equal(result.terminationReason, "EXHAUSTED");
  assert.equal(plan?.policy, "EXCEPTION");
  assert.equal(os106?.date, "2026-08-21");
  assert.equal(os106?.status, "RESCHEDULED");
  assert.equal(os106?.confirmed, false);
  assert.equal(plan?.metrics.hardConstraintViolations, 0);
  assert.deepEqual(plan && validateSchedule(plan.schedule), []);
});
