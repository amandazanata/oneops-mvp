import assert from "node:assert/strict";
import test from "node:test";

import { createDemoFixture, createRecoveryFixture } from "../domain/fixture.ts";
import type { RecoveryPlan, ServiceOrder } from "../domain/types.ts";
import {
  InMemoryOneOpsRepository,
  VersionConflictError,
} from "./memory-repository.ts";

const reviewedOrder = (): ServiceOrder => {
  const order = createRecoveryFixture().orders.find(({ id }) => id === "OS-106");
  assert.ok(order);
  return order;
};

const recommendedPlan = (baseVersion: number): RecoveryPlan => {
  const before = createRecoveryFixture();
  const orders = before.orders.map((order) => {
    if (["OS-102", "OS-106"].includes(order.id)) {
      return { ...order, technicianIds: ["TECH-JOAO", "TECH-MARINA"] as const };
    }
    if (order.id === "OS-104") {
      return { ...order, technicianIds: ["TECH-MARINA"] as const };
    }
    if (order.id === "OS-105") {
      return { ...order, start: "11:30", end: "13:00" };
    }
    return order;
  });
  const schedule = { ...before, version: baseVersion, orders };
  const changes = schedule.orders.flatMap((after) => {
    const original = before.orders.find(({ id }) => id === after.id);
    return original && JSON.stringify(original) !== JSON.stringify(after)
      ? [{ orderId: after.id, before: original, after, direct: after.id !== "OS-105" }]
      : [];
  });

  return {
    id: "PLAN-RECOMMENDED",
    baseGeneration: 1,
    baseVersion,
    policy: "RECOMMENDED",
    proofStatus: "OPTIMAL",
    terminationReason: "EXHAUSTED",
    changes,
    schedule,
    metrics: {
      totalOrders: 6, preservedOrders: 6, cancellations: 0, reschedules: 0,
      impactedCustomers: 4, indirectChanges: 1, teamChanges: 3, timeChanges: 1,
      shiftedMinutes: 240, maximumShiftMinutes: 240, resourceChanges: 0,
      preferredPairLosses: 2, additionalTravelMinutes: 0, overtimeMinutes: 0,
      loadImbalanceMinutes: 0, confirmedChanges: 3, confirmedShiftedMinutes: 90,
      communicatedTimeChanges: 1, hardConstraintViolations: 0,
    },
    rankVector: [], conservativeRankVector: [], canonicalKey: "recommended",
  };
};

test("initializes the deterministic five-order scenario exactly once", async () => {
  const repository = new InMemoryOneOpsRepository();

  const first = await repository.getOrInitialize(createDemoFixture());
  const second = await repository.getOrInitialize(createRecoveryFixture());

  assert.equal(first.snapshot.orders.length, 5);
  assert.deepEqual(second, first);
  assert.equal(first.version, 1);
  assert.equal(first.generation, 1);
});

test("uses CAS and idempotency when creating OS-106", async () => {
  const repository = new InMemoryOneOpsRepository();
  await repository.getOrInitialize(createDemoFixture());

  const created = await repository.createOrder(reviewedOrder(), 1, "create-order-1");
  const repeated = await repository.createOrder(reviewedOrder(), 1, "create-order-1");

  assert.equal(created.version, 2);
  assert.equal(created.snapshot.orders.length, 6);
  assert.deepEqual(repeated, created);
  await assert.rejects(
    repository.createOrder(reviewedOrder(), 1, "create-order-2"),
    VersionConflictError,
  );
});

test("applies a plan once, records one application and audits every changed order", async () => {
  const repository = new InMemoryOneOpsRepository();
  await repository.getOrInitialize(createDemoFixture());
  const withOrder = await repository.createOrder(reviewedOrder(), 1, "create-order");
  const plan = recommendedPlan(withOrder.version);
  await repository.saveSimulation(
    {
      event: null,
      result: {
        plans: [plan], recommended: plan, discardedAlternatives: [],
        impact: { directOrderIds: [], indirectOrderIds: [], nodes: [] },
        nodesVisited: 1, elapsedMs: 1, expansionLevel: 0,
        proofStatus: "OPTIMAL", terminationReason: "EXHAUSTED",
      },
    },
    withOrder.version,
    "simulate",
  );

  const applied = await repository.applyPlan(plan.id, 2, "apply-1", "Despachante Demo");
  const repeated = await repository.applyPlan(plan.id, 2, "apply-1", "Despachante Demo");

  assert.equal(applied.alreadyApplied, false);
  assert.equal(applied.state.version, 3);
  assert.equal(applied.state.applications.length, 1);
  assert.equal(applied.state.auditEntries.length, plan.changes.length);
  assert.equal(repeated.alreadyApplied, true);
  assert.deepEqual(repeated.state, applied.state);
});

test("rejects a stale apply request before mutating the schedule", async () => {
  const repository = new InMemoryOneOpsRepository();
  await repository.getOrInitialize(createDemoFixture());
  const withOrder = await repository.createOrder(reviewedOrder(), 1, "create-order");
  const stalePlan = recommendedPlan(withOrder.version);
  await repository.saveSimulation(
    {
      event: null,
      result: {
        plans: [stalePlan], recommended: stalePlan, discardedAlternatives: [],
        impact: { directOrderIds: [], indirectOrderIds: [], nodes: [] },
        nodesVisited: 1, elapsedMs: 1, expansionLevel: 0,
        proofStatus: "OPTIMAL", terminationReason: "EXHAUSTED",
      },
    },
    withOrder.version,
    "simulate",
  );

  await assert.rejects(
    repository.applyPlan(stalePlan.id, 1, "apply-stale", "Despachante Demo"),
    VersionConflictError,
  );
  assert.equal((await repository.getCurrent()).applications.length, 0);
});

test("reset creates one new generation per idempotency key", async () => {
  const repository = new InMemoryOneOpsRepository();
  const initial = await repository.getOrInitialize(createDemoFixture());

  const reset = await repository.reset(createDemoFixture(), "reset-1");
  const repeated = await repository.reset(createDemoFixture(), "reset-1");

  assert.equal(reset.generation, 2);
  assert.equal(reset.version, 2);
  assert.deepEqual(repeated, reset);
  assert.equal(reset.snapshot.orders.length, 5);
  assert.equal(reset.seedHash, initial.seedHash);
});
