import type { ScenarioAction } from "./scenario-service.ts";

const versionedActions = new Set([
  "CREATE_ORDER",
  "SIMULATE_CARLOS",
  "APPLY_RECOMMENDED",
  "APPLY_CONSERVATIVE",
]);

export class ScenarioActionPayloadError extends Error {
  readonly code = "INVALID_PAYLOAD";

  constructor(message: string) {
    super(message);
    this.name = "ScenarioActionPayloadError";
  }
}

export function parseScenarioAction(payload: unknown): ScenarioAction {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ScenarioActionPayloadError("O corpo precisa ser um objeto JSON.");
  }
  const value = payload as Record<string, unknown>;
  const action = value.action;
  if (typeof action !== "string" || (!versionedActions.has(action) && action !== "RESET")) {
    throw new ScenarioActionPayloadError("Ação desconhecida.");
  }
  if (typeof value.idempotencyKey !== "string" || !value.idempotencyKey.trim()
    || value.idempotencyKey.length > 128) {
    throw new ScenarioActionPayloadError("idempotencyKey deve ser uma string não vazia de até 128 caracteres.");
  }
  const allowed = action === "RESET"
    ? new Set(["action", "idempotencyKey"])
    : new Set(["action", "expectedVersion", "idempotencyKey"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new ScenarioActionPayloadError("O corpo contém campos não reconhecidos.");
  }
  if (action === "RESET") {
    return { action, idempotencyKey: value.idempotencyKey };
  }
  if (!Number.isInteger(value.expectedVersion) || (value.expectedVersion as number) < 1) {
    throw new ScenarioActionPayloadError("expectedVersion deve ser um inteiro positivo.");
  }
  return {
    action: action as "CREATE_ORDER" | "SIMULATE_CARLOS" | "APPLY_RECOMMENDED" | "APPLY_CONSERVATIVE",
    expectedVersion: value.expectedVersion as number,
    idempotencyKey: value.idempotencyKey,
  };
}
