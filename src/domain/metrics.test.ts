import assert from "node:assert/strict";
import test from "node:test";

import { createRecoveryFixture } from "./fixture.ts";
import {
  buildConservativeRankVector,
  buildRankVector,
  calculatePlanMetrics,
  canonicalPlanKey,
  compareRank,
} from "./metrics.ts";
import type { ScheduleSnapshot, ServiceOrder } from "./types.ts";

const replace = (
  schedule: ScheduleSnapshot,
  id: string,
  patch: Partial<ServiceOrder>,
): ScheduleSnapshot => ({
  ...schedule,
  orders: schedule.orders.map((order) =>
    order.id === id ? { ...order, ...patch } : order,
  ),
});

function recommendedSchedule(): ScheduleSnapshot {
  let schedule = createRecoveryFixture();
  schedule = replace(schedule, "OS-102", {
    technicianIds: ["TECH-JOAO", "TECH-MARINA"],
  });
  schedule = replace(schedule, "OS-104", {
    technicianIds: ["TECH-MARINA"],
  });
  schedule = replace(schedule, "OS-105", {
    start: "11:30",
    end: "13:00",
  });
  return replace(schedule, "OS-106", {
    technicianIds: ["TECH-JOAO", "TECH-MARINA"],
  });
}

function conservativeSchedule(): ScheduleSnapshot {
  let schedule = recommendedSchedule();
  schedule = replace(schedule, "OS-105", {
    start: "14:00",
    end: "15:30",
  });
  return replace(schedule, "OS-106", {
    start: "16:00",
    end: "18:00",
  });
}

test("calculates the recommended fixture metrics from before and after schedules", () => {
  const before = createRecoveryFixture();
  const metrics = calculatePlanMetrics(before, recommendedSchedule(), [
    "OS-102",
    "OS-104",
    "OS-106",
  ]);

  assert.equal(metrics.totalOrders, 6);
  assert.equal(metrics.preservedOrders, 6);
  assert.equal(metrics.cancellations, 0);
  assert.equal(metrics.reschedules, 0);
  assert.equal(metrics.impactedCustomers, 4);
  assert.equal(metrics.indirectChanges, 1);
  assert.equal(metrics.teamChanges, 3);
  assert.equal(metrics.timeChanges, 1);
  assert.equal(metrics.shiftedMinutes, 240);
  assert.equal(metrics.maximumShiftMinutes, 240);
  assert.equal(metrics.confirmedChanges, 3);
  assert.equal(metrics.confirmedShiftedMinutes, 240);
  assert.equal(metrics.hardConstraintViolations, 0);
});

test("main and conservative vectors prefer different valid fixture plans", () => {
  const before = createRecoveryFixture();
  const recommended = recommendedSchedule();
  const conservative = conservativeSchedule();
  const recommendedMetrics = calculatePlanMetrics(before, recommended, [
    "OS-102",
    "OS-104",
    "OS-106",
  ]);
  const conservativeMetrics = calculatePlanMetrics(before, conservative, [
    "OS-102",
    "OS-104",
    "OS-106",
  ]);
  const recommendedKey = canonicalPlanKey(recommended);
  const conservativeKey = canonicalPlanKey(conservative);

  assert.equal(recommendedMetrics.timeChanges, 1);
  assert.equal(conservativeMetrics.timeChanges, 2);
  assert.equal(conservativeMetrics.confirmedShiftedMinutes, 90);
  assert.ok(
    compareRank(
      buildRankVector(recommendedMetrics, recommendedKey),
      buildRankVector(conservativeMetrics, conservativeKey),
    ) < 0,
  );
  assert.ok(
    compareRank(
      buildConservativeRankVector(conservativeMetrics, conservativeKey),
      buildConservativeRankVector(recommendedMetrics, recommendedKey),
    ) < 0,
  );
});

test("ranking favors preserving an order and disfavors cancellation before travel", () => {
  const base = calculatePlanMetrics(
    createRecoveryFixture(),
    recommendedSchedule(),
    ["OS-102", "OS-104", "OS-106"],
  );
  const fivePreserved = { ...base, preservedOrders: 5, cancellations: 1 };
  const extraTravel = { ...base, additionalTravelMinutes: base.additionalTravelMinutes + 500 };

  assert.ok(
    compareRank(
      buildRankVector(base, "six"),
      buildRankVector(fivePreserved, "five"),
    ) < 0,
  );
  assert.ok(
    compareRank(
      buildRankVector(fivePreserved, "cancel"),
      buildRankVector(extraTravel, "travel"),
    ) > 0,
  );
});

test("canonical key sorts teams and resources", () => {
  const schedule = recommendedSchedule();
  const key = canonicalPlanKey(schedule);

  assert.match(
    key,
    /OS-102\|2026-08-20\|09:00\|TECH-JOAO,TECH-MARINA\|V-01\|TOOL-LADDER,TOOL-VACUUM-PUMP\|SCHEDULED/,
  );
});
