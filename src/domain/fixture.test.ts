import assert from "node:assert/strict";
import test from "node:test";

import {
  createCarlosUnavailableEvent,
  createDemoFixture,
  createRecoveryFixture,
  getTravelMinutes,
} from "./fixture.ts";

test("creates the stable five-order seed with the complete resource catalog", () => {
  const schedule = createDemoFixture();

  assert.equal(schedule.demoNow, "2026-08-19T10:00:00-03:00");
  assert.deepEqual(
    schedule.technicians.map(({ id }) => id),
    ["TECH-CARLOS", "TECH-JOAO", "TECH-MARINA"],
  );
  assert.deepEqual(
    schedule.orders.map(({ id }) => id),
    ["OS-101", "OS-102", "OS-103", "OS-104", "OS-105"],
  );
  assert.deepEqual(schedule.orders[1]?.technicianIds, [
    "TECH-CARLOS",
    "TECH-MARINA",
  ]);
  assert.equal(schedule.orders[0]?.locked, true);
  assert.equal(schedule.resources.parts.find(({ id }) => id === "PART-INSTALL-KIT")?.stock, 2);
  assert.equal(Object.isFrozen(schedule), true);
});

test("provides a symmetric travel matrix with zero diagonal", () => {
  const schedule = createDemoFixture();

  assert.equal(getTravelMinutes(schedule, "Saúde", "Pinheiros"), 30);
  assert.equal(getTravelMinutes(schedule, "Pinheiros", "Saúde"), 30);
  assert.equal(getTravelMinutes(schedule, "Moema", "Moema"), 0);
});

test("adds the reviewed sixth order and the all-day Carlos event", () => {
  const schedule = createRecoveryFixture();
  const order = schedule.orders.find(({ id }) => id === "OS-106");
  const event = createCarlosUnavailableEvent();

  assert.equal(schedule.orders.length, 6);
  assert.deepEqual(order, {
    id: "OS-106",
    service: "INSTALLATION",
    quantity: 2,
    customer: "Cliente Demonstração 106",
    location: "Vila Mariana",
    date: "2026-08-20",
    start: "15:30",
    end: "17:30",
    windowStart: "13:00",
    windowEnd: "18:00",
    durationMinutes: 120,
    priority: "NORMAL",
    requiredTeamSize: 2,
    requiredSkills: ["INSTALLATION"],
    requiredCertifications: [],
    technicianIds: ["TECH-CARLOS", "TECH-MARINA"],
    vehicleId: "V-01",
    toolIds: ["TOOL-LADDER", "TOOL-VACUUM-PUMP"],
    partRequirements: [{ partId: "PART-INSTALL-KIT", quantity: 1 }],
    confirmed: false,
    locked: false,
    sourceText:
      "Preciso instalar dois aparelhos amanhã à tarde na Vila Mariana.",
    version: 1,
    status: "SCHEDULED",
  });
  assert.deepEqual(event, {
    id: "EVENT-CARLOS-UNAVAILABLE",
    type: "TECHNICIAN_UNAVAILABLE",
    technicianId: "TECH-CARLOS",
    date: "2026-08-20",
    start: "07:00",
    end: "19:00",
    sourceText: "Carlos não poderá trabalhar amanhã.",
    createdAt: "2026-08-19T10:00:00-03:00",
  });
});
