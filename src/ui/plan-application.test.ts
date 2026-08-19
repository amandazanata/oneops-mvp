import assert from "node:assert/strict";
import test from "node:test";
import { applyPlanToOrders } from "./plan-application.ts";

const orders = [
  { id: "OS-105", start: "15:30", end: "17:00", technicians: ["João"] },
  { id: "OS-106", start: "15:30", end: "17:30", technicians: ["Carlos", "Marina"] },
];

test("recommended plan advances OS-105 and preserves OS-106 time", () => {
  const result = applyPlanToOrders(orders, "recommended");
  assert.deepEqual(result.find((order) => order.id === "OS-105"), {
    id: "OS-105", start: "11:30", end: "13:00", technicians: ["João"],
  });
  assert.equal(result.find((order) => order.id === "OS-106")?.start, "15:30");
});

test("conservative plan protects OS-105 and moves OS-106 later", () => {
  const result = applyPlanToOrders(orders, "conservative");
  assert.equal(result.find((order) => order.id === "OS-105")?.start, "14:00");
  assert.equal(result.find((order) => order.id === "OS-106")?.start, "16:00");
  assert.deepEqual(result.find((order) => order.id === "OS-106")?.technicians, ["Marina", "João"]);
});
