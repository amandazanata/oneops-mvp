import assert from "node:assert/strict";
import test from "node:test";

import {
  createCarlosUnavailableEvent,
  createExceptionStockShortageFixture,
  createRecoveryFixture,
} from "../domain/fixture.ts";
import type {
  Candidate,
  ScheduleSnapshot,
  SearchState,
  ServiceOrder,
} from "../domain/types.ts";
import { validateCandidate, validateSchedule } from "./constraints.ts";

const fixture = createRecoveryFixture();
const order = (id: string): ServiceOrder => {
  const found = fixture.orders.find((item) => item.id === id);
  assert.ok(found);
  return found;
};
const candidate = (id: string, patch: Partial<ServiceOrder> = {}): Candidate => ({
  order: { ...order(id), ...patch },
});
const state = (
  assignedOrders: readonly ServiceOrder[] = [],
  schedule: ScheduleSnapshot = fixture,
): SearchState => ({ schedule, assignedOrders });
const codes = (value: Candidate, searchState: SearchState): string[] =>
  validateCandidate(value, searchState).map(({ code }) => code);

test("rejects a technician made unavailable by the operational event", () => {
  const failures = validateCandidate(candidate("OS-104"), {
    ...state(),
    event: createCarlosUnavailableEvent(),
  });

  assert.ok(failures.some(({ code, entityId }) =>
    code === "TECHNICIAN_UNAVAILABLE" && entityId === "TECH-CARLOS"));
});

test("rejects João alone on OS-104 for both electrical skill and NR10", () => {
  const failures = validateCandidate(
    candidate("OS-104", { technicianIds: ["TECH-JOAO"] }),
    state(),
  );

  assert.ok(failures.some(({ code }) => code === "MISSING_SKILL"));
  assert.ok(failures.some(({ code }) => code === "MISSING_CERTIFICATION"));
});

test("rejects wrong team cardinality", () => {
  assert.ok(
    codes(candidate("OS-102", { technicianIds: ["TECH-MARINA"] }), state())
      .includes("TEAM_SIZE"),
  );
});

test("rejects technician overlap while accepting equality at the boundary", () => {
  assert.ok(
    codes(
      candidate("OS-106", { technicianIds: ["TECH-JOAO", "TECH-MARINA"] }),
      state([order("OS-105")]),
    ).includes("TECHNICIAN_OVERLAP"),
  );

  const exactlyAfter = candidate("OS-106", {
    start: "17:00",
    end: "19:00",
    windowEnd: "19:00",
    technicianIds: ["TECH-JOAO", "TECH-MARINA"],
  });
  assert.equal(codes(exactlyAfter, state([order("OS-105")])).includes("TECHNICIAN_OVERLAP"), false);
});

test("requires travel time and accepts exact arrival", () => {
  const early = candidate("OS-104", {
    start: "12:45",
    end: "14:45",
    windowStart: "12:00",
    technicianIds: ["TECH-MARINA"],
  });
  const exact = candidate("OS-104", { technicianIds: ["TECH-MARINA"] });

  assert.ok(codes(early, state([order("OS-103")])).includes("TRAVEL_TIME"));
  assert.equal(codes(exact, state([order("OS-103")])).includes("TRAVEL_TIME"), false);
});

test("rejects customer-window escape and non-15-minute alignment", () => {
  assert.ok(
    codes(candidate("OS-105", { start: "10:00", end: "11:30" }), state())
      .includes("CUSTOMER_WINDOW"),
  );
  assert.ok(
    codes(candidate("OS-105", { start: "15:10", end: "16:40" }), state())
      .includes("SLOT_ALIGNMENT"),
  );
});

test("rejects any mutation of a locked order", () => {
  assert.ok(
    codes(candidate("OS-101", { start: "07:15", end: "08:45" }), state())
      .includes("LOCKED_ORDER"),
  );
});

test("reports vehicle and indivisible-tool collisions", () => {
  const overlapping = candidate("OS-106", {
    start: "10:00",
    end: "12:00",
  });
  const result = codes(overlapping, state([order("OS-102")]));

  assert.ok(result.includes("VEHICLE_COLLISION"));
  assert.ok(result.includes("TOOL_COLLISION"));
});

test("rejects aggregate part demand over stock", () => {
  const shortage = createExceptionStockShortageFixture();
  const os102 = shortage.orders.find(({ id }) => id === "OS-102");
  const os106 = shortage.orders.find(({ id }) => id === "OS-106");
  assert.ok(os102 && os106);

  assert.ok(
    validateCandidate({ order: os106 }, state([os102], shortage))
      .some(({ code }) => code === "PART_STOCK"),
  );
});

test("rejects paid journey above technician maximum", () => {
  const constrained: ScheduleSnapshot = {
    ...fixture,
    technicians: fixture.technicians.map((technician) =>
      technician.id === "TECH-JOAO"
        ? { ...technician, maximumJourneyMinutes: 100 }
        : technician,
    ),
  };

  assert.ok(
    codes(candidate("OS-105"), state([], constrained)).includes("JOURNEY_MAX"),
  );
});

test("rejects a stale base version", () => {
  assert.ok(
    codes(candidate("OS-105"), { ...state(), baseVersion: 99 })
      .includes("BASE_VERSION"),
  );
});

test("a complete known-good proposed schedule has zero hard failures", () => {
  const proposed: ScheduleSnapshot = {
    ...fixture,
    orders: fixture.orders.map((current) => {
      if (["OS-102", "OS-106"].includes(current.id)) {
        return { ...current, technicianIds: ["TECH-JOAO", "TECH-MARINA"] };
      }
      if (current.id === "OS-104") return { ...current, technicianIds: ["TECH-MARINA"] };
      if (current.id === "OS-105") return { ...current, start: "11:30", end: "13:00" };
      return current;
    }),
  };

  assert.deepEqual(validateSchedule(proposed, createCarlosUnavailableEvent()), []);
});
