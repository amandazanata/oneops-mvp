import assert from "node:assert/strict";
import test from "node:test";

import { interpretInput } from "./interpreter.ts";

test("interprets the exact installation request without inventing fields", () => {
  const result = interpretInput(
    "Preciso instalar dois aparelhos amanhã à tarde na Vila Mariana.",
    "REQUEST",
  );

  assert.deepEqual(result.missingFields, []);
  assert.deepEqual(result, {
    kind: "REQUEST",
    mode: "DEMO_FALLBACK",
    originalText:
      "Preciso instalar dois aparelhos amanhã à tarde na Vila Mariana.",
    service: "INSTALLATION",
    quantity: 2,
    date: "2026-08-20",
    window: ["13:00", "18:00"],
    location: "Vila Mariana",
    durationMinutes: 120,
    technicians: 2,
    confidence: {
      service: 1,
      quantity: 1,
      date: 1,
      window: 1,
      location: 1,
      durationMinutes: 1,
      technicians: 1,
    },
    missingFields: [],
  });
});

test("normalizes case, whitespace, and terminal punctuation for the event phrase", () => {
  const result = interpretInput(
    "  CARLOS   não poderá trabalhar amanhã!!!  ",
    "EVENT",
  );

  assert.deepEqual(result, {
    kind: "EVENT",
    mode: "DEMO_FALLBACK",
    originalText: "  CARLOS   não poderá trabalhar amanhã!!!  ",
    eventType: "TECHNICIAN_UNAVAILABLE",
    technicianId: "TECH-CARLOS",
    date: "2026-08-20",
    interval: ["07:00", "19:00"],
    allDay: true,
    confidence: {
      eventType: 1,
      technicianId: 1,
      date: 1,
      interval: 1,
      allDay: 1,
    },
    missingFields: [],
  });
});

test("returns missing fields for unmatched text instead of fabricating a request", () => {
  const result = interpretInput("Tenho um serviço novo.", "REQUEST");

  assert.equal(result.kind, "REQUEST");
  assert.equal(result.mode, "UNMATCHED");
  assert.deepEqual(result.missingFields, [
    "service",
    "quantity",
    "date",
    "window",
    "location",
  ]);
  assert.equal(result.service, undefined);
  assert.equal(result.date, undefined);
});
