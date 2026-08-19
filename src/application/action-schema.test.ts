import assert from "node:assert/strict";
import test from "node:test";

import { ScenarioActionPayloadError, parseScenarioAction } from "./action-schema.ts";

test("accepts the five closed action payload variants", () => {
  assert.deepEqual(parseScenarioAction({
    action: "CREATE_ORDER", expectedVersion: 1, idempotencyKey: "create-1",
  }), {
    action: "CREATE_ORDER", expectedVersion: 1, idempotencyKey: "create-1",
  });
  assert.deepEqual(parseScenarioAction({
    action: "SIMULATE_CARLOS", expectedVersion: 2, idempotencyKey: "simulate-1",
  }), {
    action: "SIMULATE_CARLOS", expectedVersion: 2, idempotencyKey: "simulate-1",
  });
  assert.deepEqual(parseScenarioAction({
    action: "APPLY_RECOMMENDED", expectedVersion: 2, idempotencyKey: "apply-1",
  }), {
    action: "APPLY_RECOMMENDED", expectedVersion: 2, idempotencyKey: "apply-1",
  });
  assert.deepEqual(parseScenarioAction({
    action: "APPLY_CONSERVATIVE", expectedVersion: 2, idempotencyKey: "apply-2",
  }), {
    action: "APPLY_CONSERVATIVE", expectedVersion: 2, idempotencyKey: "apply-2",
  });
  assert.deepEqual(parseScenarioAction({ action: "RESET", idempotencyKey: "reset-1" }), {
    action: "RESET", idempotencyKey: "reset-1",
  });
});

test("rejects missing CAS version and unknown payload fields", () => {
  assert.throws(
    () => parseScenarioAction({ action: "CREATE_ORDER", idempotencyKey: "create" }),
    ScenarioActionPayloadError,
  );
  assert.throws(
    () => parseScenarioAction({
      action: "RESET", idempotencyKey: "reset", actor: "Administrador",
    }),
    ScenarioActionPayloadError,
  );
});

test("rejects malformed or unsupported actions", () => {
  for (const payload of [null, [], { action: "DELETE" }, { action: "RESET", idempotencyKey: "" }]) {
    assert.throws(() => parseScenarioAction(payload), ScenarioActionPayloadError);
  }
});
