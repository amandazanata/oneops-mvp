import assert from "node:assert/strict";
import test from "node:test";

import { createDemoFixture, createRecoveryFixture } from "../domain/fixture.ts";
import type { ScenarioState } from "../persistence/repository.ts";
import { planKindFromState, toUiOrders, viewForState } from "./scenario-adapter.ts";

function state(mode: ScenarioState["mode"]): ScenarioState {
  const snapshot = mode === "AGENDA" ? createDemoFixture() : createRecoveryFixture();
  return {
    generation: snapshot.generation,
    version: snapshot.version,
    seedHash: "fixture",
    mode,
    snapshot,
    simulation: null,
    applications: [],
    auditEntries: [],
  };
}

test("maps persisted domain orders into the agenda presentation", () => {
  const orders = toUiOrders(state("RECOVERY"));

  assert.equal(orders.length, 6);
  assert.deepEqual(orders.find(({ id }) => id === "OS-102")?.technicians, ["Carlos", "Marina"]);
  assert.equal(orders.find(({ id }) => id === "OS-105")?.requirements, "R32 · Manifold");
  assert.equal(orders.find(({ id }) => id === "OS-106")?.shortService, "Instalação 2×");
});

test("restores the correct workspace view from persisted mode", () => {
  assert.equal(viewForState(state("AGENDA")), "agenda");
  assert.equal(viewForState(state("RECOVERY")), "recovery");
  assert.equal(viewForState(state("APPLIED")), "applied");
});

test("recognizes a conservative application by its persisted plan id", () => {
  const value = state("APPLIED");
  const withApplication: ScenarioState = {
    ...value,
    applications: [{
      planId: "PLAN-CONSERVATIVE-abc",
      baseVersion: 2,
      appliedVersion: 3,
      idempotencyKey: "apply",
      actor: "Despachante Demo",
      appliedAt: "2026-08-19T10:00:00-03:00",
    }],
  };

  assert.equal(planKindFromState(withApplication), "conservative");
  assert.equal(planKindFromState(value), "recommended");
});
