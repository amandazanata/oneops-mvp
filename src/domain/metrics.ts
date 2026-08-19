import type {
  PlanMetrics,
  RankAtom,
  ScheduleSnapshot,
  ServiceOrder,
  Technician,
  TechnicianId,
} from "./types.ts";

const minutes = (time: string): number => {
  const [hours = 0, mins = 0] = time.split(":").map(Number);
  return hours * 60 + mins;
};

const sameSet = (left: readonly string[], right: readonly string[]): boolean =>
  [...left].sort().join("|") === [...right].sort().join("|");

const resourceChanged = (before: ServiceOrder, after: ServiceOrder): boolean =>
  before.vehicleId !== after.vehicleId ||
  !sameSet(before.toolIds, after.toolIds) ||
  JSON.stringify(before.partRequirements) !== JSON.stringify(after.partRequirements);

const changed = (before: ServiceOrder, after: ServiceOrder): boolean =>
  before.date !== after.date ||
  before.start !== after.start ||
  before.end !== after.end ||
  before.status !== after.status ||
  !sameSet(before.technicianIds, after.technicianIds) ||
  resourceChanged(before, after);

const hasMutualPreferredPair = (
  order: ServiceOrder,
  technicians: ReadonlyMap<TechnicianId, Technician>,
): boolean => {
  for (const leftId of order.technicianIds) {
    for (const rightId of order.technicianIds) {
      if (leftId === rightId) continue;
      const left = technicians.get(leftId);
      const right = technicians.get(rightId);
      if (
        left?.preferredPartnerIds.includes(rightId) &&
        right?.preferredPartnerIds.includes(leftId)
      ) {
        return true;
      }
    }
  }
  return false;
};

interface Workload {
  readonly paidMinutes: number;
  readonly travelMinutes: number;
}

const workloads = (schedule: ScheduleSnapshot): ReadonlyMap<TechnicianId, Workload> => {
  const result = new Map<TechnicianId, Workload>();
  for (const technician of schedule.technicians) {
    const assigned = schedule.orders
      .filter(
        (order) =>
          order.status !== "CANCELLED" &&
          order.technicianIds.includes(technician.id),
      )
      .sort((left, right) =>
        `${left.date}|${left.start}|${left.id}`.localeCompare(
          `${right.date}|${right.start}|${right.id}`,
        ),
      );
    let travelMinutes = 0;
    let serviceMinutes = 0;
    let location = technician.base;
    for (const order of assigned) {
      travelMinutes += schedule.travelMinutes[`${location}|${order.location}`] ?? 0;
      serviceMinutes += order.durationMinutes;
      location = order.location;
    }
    if (assigned.length > 0) {
      travelMinutes += schedule.travelMinutes[`${location}|${technician.base}`] ?? 0;
    }
    result.set(technician.id, {
      travelMinutes,
      paidMinutes: serviceMinutes + travelMinutes,
    });
  }
  return result;
};

export function calculatePlanMetrics(
  before: ScheduleSnapshot,
  after: ScheduleSnapshot,
  directOrderIds: readonly string[],
  hardConstraintViolations = 0,
): PlanMetrics {
  const direct = new Set(directOrderIds);
  const afterById = new Map(after.orders.map((order) => [order.id, order]));
  const technicians = new Map(before.technicians.map((tech) => [tech.id, tech]));
  let preservedOrders = 0;
  let cancellations = 0;
  let reschedules = 0;
  let impactedCustomers = 0;
  let indirectChanges = 0;
  let teamChanges = 0;
  let timeChanges = 0;
  let shiftedMinutes = 0;
  let maximumShiftMinutes = 0;
  let resourceChanges = 0;
  let preferredPairLosses = 0;
  let confirmedChanges = 0;
  let confirmedShiftedMinutes = 0;
  let communicatedTimeChanges = 0;

  for (const original of before.orders) {
    const proposed = afterById.get(original.id);
    if (!proposed || proposed.status === "CANCELLED") {
      cancellations += 1;
      impactedCustomers += 1;
      if (original.confirmed) confirmedChanges += 1;
      continue;
    }
    preservedOrders += 1;
    if (proposed.date !== original.date || proposed.status === "RESCHEDULED") {
      reschedules += 1;
    }
    if (!changed(original, proposed)) continue;

    impactedCustomers += 1;
    if (!direct.has(original.id)) indirectChanges += 1;
    if (original.confirmed) confirmedChanges += 1;
    if (!sameSet(original.technicianIds, proposed.technicianIds)) teamChanges += 1;
    if (resourceChanged(original, proposed)) resourceChanges += 1;

    if (original.date === proposed.date && original.start !== proposed.start) {
      const shift = Math.abs(minutes(proposed.start) - minutes(original.start));
      timeChanges += 1;
      shiftedMinutes += shift;
      maximumShiftMinutes = Math.max(maximumShiftMinutes, shift);
      if (original.confirmed) {
        confirmedShiftedMinutes += shift;
        communicatedTimeChanges += 1;
      }
    }

    if (
      hasMutualPreferredPair(original, technicians) &&
      !hasMutualPreferredPair(proposed, technicians)
    ) {
      preferredPairLosses += 1;
    }
  }

  const beforeWork = workloads(before);
  const afterWork = workloads(after);
  const beforeTravel = [...beforeWork.values()].reduce(
    (sum, workload) => sum + workload.travelMinutes,
    0,
  );
  const afterTravel = [...afterWork.values()].reduce(
    (sum, workload) => sum + workload.travelMinutes,
    0,
  );
  const paid = [...afterWork.values()].map(({ paidMinutes }) => paidMinutes);
  const overtimeMinutes = [...afterWork.entries()].reduce((sum, [id, workload]) => {
    const regular = technicians.get(id)?.regularJourneyMinutes ?? 480;
    return sum + Math.max(0, workload.paidMinutes - regular);
  }, 0);

  return {
    totalOrders: before.orders.length,
    preservedOrders,
    cancellations,
    reschedules,
    impactedCustomers,
    indirectChanges,
    teamChanges,
    timeChanges,
    shiftedMinutes,
    maximumShiftMinutes,
    resourceChanges,
    preferredPairLosses,
    additionalTravelMinutes: Math.max(0, afterTravel - beforeTravel),
    overtimeMinutes,
    loadImbalanceMinutes: paid.length === 0 ? 0 : Math.max(...paid) - Math.min(...paid),
    confirmedChanges,
    confirmedShiftedMinutes,
    communicatedTimeChanges,
    hardConstraintViolations,
  };
}

export function canonicalPlanKey(
  input: ScheduleSnapshot | readonly ServiceOrder[],
): string {
  const orders = "orders" in input ? input.orders : input;
  return [...orders]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((order) =>
      [
        order.id,
        order.date,
        order.start,
        [...order.technicianIds].sort().join(","),
        order.vehicleId ?? "NONE",
        [...order.toolIds].sort().join(","),
        order.status,
      ].join("|"),
    )
    .join(";");
}

export function buildRankVector(
  metrics: PlanMetrics,
  canonicalKey: string,
): readonly RankAtom[] {
  return [
    -metrics.preservedOrders,
    metrics.cancellations,
    metrics.reschedules,
    metrics.impactedCustomers,
    metrics.indirectChanges,
    metrics.teamChanges,
    metrics.timeChanges,
    metrics.shiftedMinutes,
    metrics.maximumShiftMinutes,
    metrics.resourceChanges,
    metrics.preferredPairLosses,
    metrics.additionalTravelMinutes,
    metrics.overtimeMinutes,
    metrics.loadImbalanceMinutes,
    canonicalKey,
  ];
}

export function buildConservativeRankVector(
  metrics: PlanMetrics,
  canonicalKey: string,
): readonly RankAtom[] {
  return [
    -metrics.preservedOrders,
    metrics.cancellations,
    metrics.reschedules,
    metrics.confirmedChanges,
    metrics.confirmedShiftedMinutes,
    metrics.indirectChanges,
    metrics.communicatedTimeChanges,
    metrics.teamChanges,
    metrics.resourceChanges,
    metrics.additionalTravelMinutes,
    metrics.overtimeMinutes,
    canonicalKey,
  ];
}

export function compareRank(
  left: readonly RankAtom[],
  right: readonly RankAtom[],
): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (a === b) continue;
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b));
  }
  return 0;
}
