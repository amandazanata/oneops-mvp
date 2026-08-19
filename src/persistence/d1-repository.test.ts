import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { Miniflare } from "miniflare";

import { createDemoFixture, createRecoveryFixture } from "../domain/fixture.ts";
import type { RecoveryPlan } from "../domain/types.ts";
import { D1OneOpsRepository } from "./d1-repository.ts";
import { VersionConflictError } from "./repository.ts";

async function repositoryFixture(applyMigration = true) {
  const miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    d1Databases: ["DB"],
  });
  const database = await miniflare.getD1Database("DB");
  if (applyMigration) {
    const migration = await readFile(new URL("../../drizzle/0000_oneops.sql", import.meta.url), "utf8");
    await database.batch(
      migration
        .split("--> statement-breakpoint")
        .map((statement) => statement.trim())
        .filter(Boolean)
        .map((statement) => database.prepare(statement)),
    );
  }
  return {
    repository: new D1OneOpsRepository(database),
    dispose: () => miniflare.dispose(),
  };
}

test("D1 initializes the runtime schema when the bound database is empty", async () => {
  const { repository, dispose } = await repositoryFixture(false);
  try {
    const state = await repository.getOrInitialize(createDemoFixture());
    assert.equal(state.snapshot.orders.length, 5);
    assert.equal(state.version, 1);
  } finally {
    await dispose();
  }
});

function plan(baseVersion: number): RecoveryPlan {
  const before = createRecoveryFixture();
  const schedule = {
    ...before,
    version: baseVersion,
    orders: before.orders.map((order) => order.id === "OS-104"
      ? { ...order, technicianIds: ["TECH-MARINA"] as const }
      : order),
  };
  const original = before.orders.find(({ id }) => id === "OS-104");
  const changed = schedule.orders.find(({ id }) => id === "OS-104");
  assert.ok(original && changed);
  return {
    id: "PLAN-D1",
    baseGeneration: 1,
    baseVersion,
    policy: "RECOMMENDED",
    proofStatus: "OPTIMAL",
    terminationReason: "EXHAUSTED",
    schedule,
    changes: [{ orderId: "OS-104", before: original, after: changed, direct: true }],
    metrics: {
      totalOrders: 6, preservedOrders: 6, cancellations: 0, reschedules: 0,
      impactedCustomers: 1, indirectChanges: 0, teamChanges: 1, timeChanges: 0,
      shiftedMinutes: 0, maximumShiftMinutes: 0, resourceChanges: 0,
      preferredPairLosses: 0, additionalTravelMinutes: 0, overtimeMinutes: 0,
      loadImbalanceMinutes: 0, confirmedChanges: 1, confirmedShiftedMinutes: 0,
      communicatedTimeChanges: 0, hardConstraintViolations: 0,
    },
    rankVector: [], conservativeRankVector: [], canonicalKey: "d1-plan",
  };
}

test("D1 persists an initialized scenario and enforces create-order CAS", async () => {
  const { repository, dispose } = await repositoryFixture();
  try {
    await repository.getOrInitialize(createDemoFixture());
    const order = createRecoveryFixture().orders.find(({ id }) => id === "OS-106");
    assert.ok(order);

    const created = await repository.createOrder(order, 1, "d1-create");
    const fromAnotherAdapter = await repository.getCurrent();

    assert.equal(created.version, 2);
    assert.equal(fromAnotherAdapter.snapshot.orders.length, 6);
    await assert.rejects(
      repository.createOrder({ ...order, id: "OS-107" }, 1, "d1-stale"),
      VersionConflictError,
    );
  } finally {
    await dispose();
  }
});

test("D1 allows only one of two concurrent writes at the same base version", async () => {
  const { repository, dispose } = await repositoryFixture();
  try {
    await repository.getOrInitialize(createDemoFixture());
    const order = createRecoveryFixture().orders.find(({ id }) => id === "OS-106");
    assert.ok(order);

    const results = await Promise.allSettled([
      repository.createOrder(order, 1, "race-a"),
      repository.createOrder({ ...order, id: "OS-107" }, 1, "race-b"),
    ]);

    assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal(results.filter(({ status }) => status === "rejected").length, 1);
    assert.equal((await repository.getCurrent()).snapshot.orders.length, 6);
  } finally {
    await dispose();
  }
});

test("D1 applies a plan atomically once and keeps normalized audit rows", async () => {
  const { repository, dispose } = await repositoryFixture();
  try {
    await repository.getOrInitialize(createRecoveryFixture());
    const recoveryPlan = plan(1);
    await repository.saveSimulation(
      {
        event: null,
        result: {
          plans: [recoveryPlan], recommended: recoveryPlan,
          discardedAlternatives: [], impact: { directOrderIds: [], indirectOrderIds: [], nodes: [] },
          nodesVisited: 1, elapsedMs: 1, expansionLevel: 0,
          proofStatus: "OPTIMAL", terminationReason: "EXHAUSTED",
        },
      },
      1,
      "d1-simulate",
    );

    const applied = await repository.applyPlan("PLAN-D1", 1, "d1-apply", "Despachante Demo");
    const repeated = await repository.applyPlan("PLAN-D1", 1, "d1-apply", "Despachante Demo");

    assert.equal(applied.alreadyApplied, false);
    assert.equal(applied.state.version, 2);
    assert.equal(applied.state.auditEntries.length, 1);
    assert.equal(repeated.alreadyApplied, true);
    assert.equal(repeated.state.version, 2);
  } finally {
    await dispose();
  }
});

test("D1 reset is idempotent and advances generation and version together", async () => {
  const { repository, dispose } = await repositoryFixture();
  try {
    await repository.getOrInitialize(createDemoFixture());
    const first = await repository.reset(createDemoFixture(), "d1-reset");
    const repeated = await repository.reset(createDemoFixture(), "d1-reset");

    assert.equal(first.generation, 2);
    assert.equal(first.version, 2);
    assert.deepEqual(repeated, first);
  } finally {
    await dispose();
  }
});
