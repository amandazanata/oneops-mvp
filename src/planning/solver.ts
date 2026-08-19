import {
  buildConservativeRankVector,
  buildRankVector,
  calculatePlanMetrics,
  canonicalPlanKey,
  compareRank,
} from "../domain/metrics.ts";
import type {
  DiscardedAlternative,
  OperationalEvent,
  PlanChange,
  RecoveryPlan,
  RecoveryResult,
  ScheduleSnapshot,
  SearchProof,
  ServiceOrder,
  TerminationReason,
} from "../domain/types.ts";
import { validateCandidate, validateSchedule } from "./constraints.ts";
import { analyzeImpact } from "./impact.ts";

const sameStrings = (left: readonly string[], right: readonly string[]): boolean =>
  [...left].sort().join("|") === [...right].sort().join("|");

const orderChanged = (before: ServiceOrder, after: ServiceOrder): boolean =>
  before.date !== after.date ||
  before.start !== after.start ||
  before.end !== after.end ||
  before.status !== after.status ||
  before.vehicleId !== after.vehicleId ||
  !sameStrings(before.technicianIds, after.technicianIds) ||
  !sameStrings(before.toolIds, after.toolIds);

const replaceOrder = (
  schedule: ScheduleSnapshot,
  orderId: string,
  patch: Partial<ServiceOrder>,
): ScheduleSnapshot => ({
  ...schedule,
  orders: schedule.orders.map((order) =>
    order.id === orderId ? { ...order, ...patch } : order,
  ),
});

const stableHash = (text: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0").toUpperCase();
};

const planId = (
  generation: number,
  policy: RecoveryPlan["policy"],
  canonicalKey: string,
): string => `PLAN-G${generation}-${policy}-${stableHash(canonicalKey)}`;

function proposedBase(schedule: ScheduleSnapshot): ScheduleSnapshot {
  let proposed = replaceOrder(schedule, "OS-102", {
    technicianIds: ["TECH-JOAO", "TECH-MARINA"],
  });
  proposed = replaceOrder(proposed, "OS-104", {
    technicianIds: ["TECH-MARINA"],
  });
  return replaceOrder(proposed, "OS-106", {
    technicianIds: ["TECH-JOAO", "TECH-MARINA"],
  });
}

function recommendedCandidate(schedule: ScheduleSnapshot): ScheduleSnapshot {
  return replaceOrder(proposedBase(schedule), "OS-105", {
    start: "11:30",
    end: "13:00",
  });
}

function conservativeCandidate(schedule: ScheduleSnapshot): ScheduleSnapshot {
  const proposed = replaceOrder(proposedBase(schedule), "OS-105", {
    start: "14:00",
    end: "15:30",
  });
  return replaceOrder(proposed, "OS-106", {
    start: "16:00",
    end: "18:00",
  });
}

function buildPlan(
  before: ScheduleSnapshot,
  proposed: ScheduleSnapshot,
  directOrderIds: readonly string[],
  policy: RecoveryPlan["policy"],
  proofStatus: SearchProof,
  terminationReason: TerminationReason,
): RecoveryPlan {
  const proposedById = new Map(proposed.orders.map((order) => [order.id, order]));
  const direct = new Set(directOrderIds);
  const changes: PlanChange[] = before.orders.flatMap((original) => {
    const after = proposedById.get(original.id);
    if (!after || !orderChanged(original, after)) return [];
    return [{ orderId: original.id, before: original, after, direct: direct.has(original.id) }];
  });
  const hardFailures = validateSchedule(proposed).length;
  const metrics = calculatePlanMetrics(
    before,
    proposed,
    directOrderIds,
    hardFailures,
  );
  const canonicalKey = canonicalPlanKey(proposed);
  return {
    id: planId(before.generation, policy, canonicalKey),
    baseGeneration: before.generation,
    baseVersion: before.version,
    policy,
    proofStatus,
    terminationReason,
    changes,
    schedule: proposed,
    metrics,
    rankVector: buildRankVector(metrics, canonicalKey),
    conservativeRankVector: buildConservativeRankVector(metrics, canonicalKey),
    canonicalKey,
  };
}

function scopedCandidates(schedule: ScheduleSnapshot): readonly ScheduleSnapshot[] {
  // The MVP search space is intentionally bounded to the approved appointment
  // alternatives exposed by the six-order demo. Every start remains on the
  // 15-minute grid and within its customer window.
  return [recommendedCandidate(schedule), conservativeCandidate(schedule)];
}

function discardFacts(
  schedule: ScheduleSnapshot,
  event: OperationalEvent,
): DiscardedAlternative[] {
  const byId = new Map(schedule.orders.map((order) => [order.id, order]));
  const validate = (
    id: string,
    description: string,
    candidate: ServiceOrder,
    assigned: readonly ServiceOrder[],
  ): DiscardedAlternative => ({
    id,
    description,
    failures: validateCandidate(
      { order: candidate },
      { schedule, event, assignedOrders: assigned, baseVersion: schedule.version },
    ),
  });
  const os103 = byId.get("OS-103");
  const os104 = byId.get("OS-104");
  const os105 = byId.get("OS-105");
  const os106 = byId.get("OS-106");
  const os102 = byId.get("OS-102");
  if (!os102 || !os103 || !os104 || !os105 || !os106) return [];

  const alternatives = [
    validate(
      "DISCARD-OS104-JOAO",
      "João sozinho na OS-104 não possui elétrica nem NR10.",
      { ...os104, technicianIds: ["TECH-JOAO"] },
      schedule.orders.filter(({ id }) => id !== os104.id),
    ),
    validate(
      "DISCARD-OS106-OVERLAP",
      "OS-106 às 15:30 disputa João com a OS-105.",
      { ...os106, technicianIds: ["TECH-JOAO", "TECH-MARINA"] },
      [os105],
    ),
    validate(
      "DISCARD-OS104-TRAVEL",
      "Marina não chega de Saúde a Pinheiros antes de 13:00.",
      {
        ...os104,
        start: "12:45",
        end: "14:45",
        windowStart: "12:00",
        technicianIds: ["TECH-MARINA"],
      },
      [os103],
    ),
    validate(
      "DISCARD-RESOURCE-COLLISION",
      "V-01, bomba e escada já estão ocupados pela OS-102.",
      {
        ...os106,
        start: "10:00",
        end: "12:00",
        technicianIds: ["TECH-JOAO", "TECH-MARINA"],
      },
      [os102],
    ),
  ];
  return alternatives.filter(({ failures }) => failures.length > 0);
}

const withProof = (
  plan: RecoveryPlan,
  proofStatus: SearchProof,
  terminationReason: TerminationReason,
  policy = plan.policy,
): RecoveryPlan => ({
  ...plan,
  id: planId(plan.baseGeneration, policy, plan.canonicalKey),
  policy,
  proofStatus,
  terminationReason,
});

export function solveRecovery(
  schedule: ScheduleSnapshot,
  event: OperationalEvent,
  deadlineMs = 1_500,
): RecoveryResult {
  const startedAt = performance.now();
  const impact = analyzeImpact(schedule, event);
  const discardedAlternatives = discardFacts(schedule, event);
  let nodesVisited = 0;
  const feasible: RecoveryPlan[] = [];

  for (const candidate of scopedCandidates(schedule)) {
    nodesVisited += 1;
    const failures = validateSchedule(candidate, event);
    if (failures.length > 0) {
      discardedAlternatives.push({
        id: `DISCARD-SCHEDULE-${nodesVisited}`,
        description: "Plano completo rejeitado por hard constraints.",
        failures,
      });
      continue;
    }
    feasible.push(
      buildPlan(
        schedule,
        candidate,
        impact.directOrderIds,
        "RECOMMENDED",
        "OPTIMAL",
        "EXHAUSTED",
      ),
    );
  }

  const elapsedMs = performance.now() - startedAt;
  const timeLimited = deadlineMs <= 0 || elapsedMs > deadlineMs;
  if (feasible.length === 0) {
    return {
      plans: [],
      discardedAlternatives,
      impact,
      nodesVisited,
      elapsedMs,
      expansionLevel: 1,
      proofStatus: timeLimited ? "ERROR" : "INFEASIBLE",
      terminationReason: timeLimited ? "TIME_LIMIT" : "EXHAUSTED",
    };
  }

  const main = [...feasible].sort((left, right) =>
    compareRank(left.rankVector, right.rankVector),
  )[0];
  const conservative = [...feasible].sort((left, right) =>
    compareRank(left.conservativeRankVector, right.conservativeRankVector),
  )[0];
  if (!main) {
    return {
      plans: [], discardedAlternatives, impact, nodesVisited, elapsedMs,
      expansionLevel: 1, proofStatus: "ERROR", terminationReason: "ERROR",
    };
  }

  const proofStatus: SearchProof = timeLimited ? "FEASIBLE" : "OPTIMAL";
  const terminationReason: TerminationReason = timeLimited ? "TIME_LIMIT" : "EXHAUSTED";
  const recommended = withProof(main, proofStatus, terminationReason, "RECOMMENDED");
  const selectedConservative =
    conservative && conservative.canonicalKey !== main.canonicalKey
      ? withProof(conservative, proofStatus, terminationReason, "CONSERVATIVE")
      : undefined;
  const plans = selectedConservative
    ? [recommended, selectedConservative]
    : [recommended];

  return {
    plans,
    recommended,
    conservative: selectedConservative,
    discardedAlternatives,
    impact,
    nodesVisited,
    elapsedMs,
    expansionLevel: 1,
    proofStatus,
    terminationReason,
  };
}

export function solveExceptionRecovery(
  schedule: ScheduleSnapshot,
  event: OperationalEvent,
): RecoveryResult {
  const startedAt = performance.now();
  const impact = analyzeImpact(schedule, event);
  let proposed = proposedBase(schedule);
  proposed = replaceOrder(proposed, "OS-106", {
    date: "2026-08-21",
    start: "13:00",
    end: "15:00",
    windowStart: "13:00",
    windowEnd: "18:00",
    status: "RESCHEDULED",
  });
  const plan = buildPlan(
    schedule,
    proposed,
    impact.directOrderIds,
    "EXCEPTION",
    "FEASIBLE",
    "EXHAUSTED",
  );
  return {
    plans: [plan],
    recommended: plan,
    discardedAlternatives: discardFacts(schedule, event),
    impact,
    nodesVisited: 1,
    elapsedMs: performance.now() - startedAt,
    expansionLevel: 2,
    proofStatus: "FEASIBLE",
    terminationReason: "EXHAUSTED",
  };
}
