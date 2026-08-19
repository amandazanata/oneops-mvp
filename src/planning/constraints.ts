import type {
  Candidate,
  ConstraintFailure,
  OperationalEvent,
  ScheduleSnapshot,
  SearchState,
  ServiceOrder,
  Technician,
  TechnicianId,
} from "../domain/types.ts";

const toMinutes = (time: string): number => {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return hour * 60 + minute;
};

const overlaps = (left: ServiceOrder, right: ServiceOrder): boolean =>
  left.date === right.date &&
  toMinutes(left.start) < toMinutes(right.end) &&
  toMinutes(right.start) < toMinutes(left.end);

const eventOverlaps = (order: ServiceOrder, event: OperationalEvent): boolean =>
  order.date === event.date &&
  toMinutes(order.start) < toMinutes(event.end) &&
  toMinutes(event.start) < toMinutes(order.end);

const failure = (
  code: string,
  orderId: string,
  expected: string,
  actual: string,
  extra: Partial<ConstraintFailure> = {},
): ConstraintFailure => ({ code, orderId, expected, actual, ...extra });

const sameStrings = (left: readonly string[], right: readonly string[]): boolean =>
  [...left].sort().join("|") === [...right].sort().join("|");

const lockedOrderChanged = (left: ServiceOrder, right: ServiceOrder): boolean =>
  left.date !== right.date ||
  left.start !== right.start ||
  left.end !== right.end ||
  left.status !== right.status ||
  left.vehicleId !== right.vehicleId ||
  !sameStrings(left.technicianIds, right.technicianIds) ||
  !sameStrings(left.toolIds, right.toolIds);

function validateAvailability(
  order: ServiceOrder,
  technician: Technician,
  event?: OperationalEvent,
): ConstraintFailure[] {
  const failures: ConstraintFailure[] = [];
  const availability = technician.availability.find(
    (interval) =>
      interval.date === order.date &&
      toMinutes(interval.start) <= toMinutes(order.start) &&
      toMinutes(interval.end) >= toMinutes(order.end),
  );
  if (!availability || technician.status !== "ACTIVE") {
    failures.push(
      failure(
        "TECHNICIAN_AVAILABILITY",
        order.id,
        "técnico ativo e disponível durante todo o serviço",
        `${technician.status}:${order.date} ${order.start}-${order.end}`,
        { entityId: technician.id },
      ),
    );
  }
  if (
    event?.type === "TECHNICIAN_UNAVAILABLE" &&
    event.technicianId === technician.id &&
    eventOverlaps(order, event)
  ) {
    failures.push(
      failure(
        "TECHNICIAN_UNAVAILABLE",
        order.id,
        `fora do intervalo ${event.start}-${event.end}`,
        `${order.start}-${order.end}`,
        { entityId: technician.id, interval: [event.start, event.end] },
      ),
    );
  }
  return failures;
}

function validateQualifications(
  order: ServiceOrder,
  technician: Technician,
): ConstraintFailure[] {
  const failures: ConstraintFailure[] = [];
  for (const skill of order.requiredSkills) {
    if (!technician.skills.includes(skill)) {
      failures.push(
        failure("MISSING_SKILL", order.id, skill, technician.skills.join(","), {
          entityId: technician.id,
        }),
      );
    }
  }
  for (const certification of order.requiredCertifications) {
    if (!technician.certifications.includes(certification)) {
      failures.push(
        failure(
          "MISSING_CERTIFICATION",
          order.id,
          certification,
          technician.certifications.join(","),
          { entityId: technician.id },
        ),
      );
    }
  }
  return failures;
}

function validateTravelForTechnician(
  order: ServiceOrder,
  technicianId: TechnicianId,
  assignedOrders: readonly ServiceOrder[],
  schedule: ScheduleSnapshot,
): ConstraintFailure[] {
  const sameDay = assignedOrders
    .filter(
      (assigned) =>
        assigned.id !== order.id &&
        assigned.status !== "CANCELLED" &&
        assigned.date === order.date &&
        assigned.technicianIds.includes(technicianId),
    )
    .sort((left, right) => toMinutes(left.start) - toMinutes(right.start));
  const previous = [...sameDay]
    .filter((assigned) => toMinutes(assigned.end) <= toMinutes(order.start))
    .sort((left, right) => toMinutes(right.end) - toMinutes(left.end))[0];
  const next = sameDay
    .filter((assigned) => toMinutes(assigned.start) >= toMinutes(order.end))
    .sort((left, right) => toMinutes(left.start) - toMinutes(right.start))[0];
  const failures: ConstraintFailure[] = [];

  if (previous) {
    const travel = schedule.travelMinutes[`${previous.location}|${order.location}`];
    if (travel === undefined) {
      failures.push(
        failure("TRAVEL_MATRIX_MISSING", order.id, "par de bairros conhecido", `${previous.location}|${order.location}`, {
          entityId: technicianId,
          conflictingOrderId: previous.id,
        }),
      );
    } else if (toMinutes(previous.end) + travel > toMinutes(order.start)) {
      failures.push(
        failure("TRAVEL_TIME", order.id, `chegada até ${order.start}`, `${previous.end} + ${travel} min`, {
          entityId: technicianId,
          conflictingOrderId: previous.id,
        }),
      );
    }
  }

  if (next) {
    const travel = schedule.travelMinutes[`${order.location}|${next.location}`];
    if (travel === undefined) {
      failures.push(
        failure("TRAVEL_MATRIX_MISSING", order.id, "par de bairros conhecido", `${order.location}|${next.location}`, {
          entityId: technicianId,
          conflictingOrderId: next.id,
        }),
      );
    } else if (toMinutes(order.end) + travel > toMinutes(next.start)) {
      failures.push(
        failure("TRAVEL_TIME", order.id, `chegada até ${next.start}`, `${order.end} + ${travel} min`, {
          entityId: technicianId,
          conflictingOrderId: next.id,
        }),
      );
    }
  }
  return failures;
}

function technicianPaidMinutes(
  technician: Technician,
  orders: readonly ServiceOrder[],
  schedule: ScheduleSnapshot,
): number | undefined {
  const assigned = orders
    .filter(
      (order) =>
        order.status !== "CANCELLED" && order.technicianIds.includes(technician.id),
    )
    .sort((left, right) =>
      `${left.date}|${left.start}|${left.id}`.localeCompare(
        `${right.date}|${right.start}|${right.id}`,
      ),
    );
  if (assigned.length === 0) return 0;
  let total = 0;
  let location = technician.base;
  for (const order of assigned) {
    const travel = schedule.travelMinutes[`${location}|${order.location}`];
    if (travel === undefined) return undefined;
    total += travel + order.durationMinutes;
    location = order.location;
  }
  const returnTravel = schedule.travelMinutes[`${location}|${technician.base}`];
  return returnTravel === undefined ? undefined : total + returnTravel;
}

export function validateCandidate(
  candidate: Candidate,
  state: SearchState,
): ConstraintFailure[] {
  const { order } = candidate;
  const { schedule } = state;
  const failures: ConstraintFailure[] = [];
  const original = schedule.orders.find(({ id }) => id === order.id);
  const technicianById = new Map(
    schedule.technicians.map((technician) => [technician.id, technician]),
  );

  if (state.baseVersion !== undefined && state.baseVersion !== schedule.version) {
    failures.push(
      failure("BASE_VERSION", order.id, String(schedule.version), String(state.baseVersion)),
    );
  }

  if (toMinutes(order.start) % 15 !== 0 || toMinutes(order.end) % 15 !== 0) {
    failures.push(
      failure("SLOT_ALIGNMENT", order.id, "início e fim no grid de 15 minutos", `${order.start}-${order.end}`),
    );
  }
  if (toMinutes(order.end) - toMinutes(order.start) !== order.durationMinutes) {
    failures.push(
      failure("DURATION", order.id, `${order.durationMinutes} minutos`, `${toMinutes(order.end) - toMinutes(order.start)} minutos`),
    );
  }
  if (
    order.status !== "RESCHEDULED" &&
    (toMinutes(order.start) < toMinutes(order.windowStart) ||
      toMinutes(order.end) > toMinutes(order.windowEnd))
  ) {
    failures.push(
      failure("CUSTOMER_WINDOW", order.id, `${order.windowStart}-${order.windowEnd}`, `${order.start}-${order.end}`),
    );
  }
  if (original?.locked && lockedOrderChanged(original, order)) {
    failures.push(
      failure("LOCKED_ORDER", order.id, "atribuição original imutável", `${order.date} ${order.start}-${order.end}`),
    );
  }
  if (new Set(order.technicianIds).size !== order.requiredTeamSize) {
    failures.push(
      failure("TEAM_SIZE", order.id, String(order.requiredTeamSize), String(new Set(order.technicianIds).size)),
    );
  }

  const allOrders = [
    ...state.assignedOrders.filter((assigned) => assigned.id !== order.id),
    order,
  ];
  for (const technicianId of order.technicianIds) {
    const technician = technicianById.get(technicianId);
    if (!technician) {
      failures.push(
        failure("UNKNOWN_TECHNICIAN", order.id, "técnico cadastrado", technicianId, {
          entityId: technicianId,
        }),
      );
      continue;
    }
    failures.push(...validateAvailability(order, technician, state.event));
    failures.push(...validateQualifications(order, technician));
    for (const assigned of state.assignedOrders) {
      if (
        assigned.id !== order.id &&
        assigned.status !== "CANCELLED" &&
        assigned.technicianIds.includes(technicianId) &&
        overlaps(order, assigned)
      ) {
        failures.push(
          failure("TECHNICIAN_OVERLAP", order.id, "intervalos sem sobreposição", `${order.start}-${order.end}`, {
            entityId: technicianId,
            conflictingOrderId: assigned.id,
            interval: [assigned.start, assigned.end],
          }),
        );
      }
    }
    failures.push(
      ...validateTravelForTechnician(
        order,
        technicianId,
        state.assignedOrders,
        schedule,
      ),
    );
    const paid = technicianPaidMinutes(technician, allOrders, schedule);
    if (paid === undefined) {
      failures.push(
        failure("TRAVEL_MATRIX_MISSING", order.id, "rota completa conhecida", "rota incompleta", {
          entityId: technicianId,
        }),
      );
    } else if (paid > technician.maximumJourneyMinutes) {
      failures.push(
        failure("JOURNEY_MAX", order.id, `até ${technician.maximumJourneyMinutes} minutos`, `${paid} minutos`, {
          entityId: technicianId,
        }),
      );
    }
  }

  if (order.vehicleId) {
    const vehicle = schedule.resources.vehicles.find(({ id }) => id === order.vehicleId);
    if (!vehicle?.available) {
      failures.push(
        failure("VEHICLE_UNAVAILABLE", order.id, "veículo disponível", order.vehicleId, {
          entityId: order.vehicleId,
        }),
      );
    } else if (vehicle.capacity < order.technicianIds.length) {
      failures.push(
        failure("VEHICLE_CAPACITY", order.id, `capacidade >= ${order.technicianIds.length}`, String(vehicle.capacity), {
          entityId: order.vehicleId,
        }),
      );
    }
    for (const assigned of state.assignedOrders) {
      if (
        assigned.id !== order.id &&
        assigned.vehicleId === order.vehicleId &&
        assigned.status !== "CANCELLED" &&
        overlaps(order, assigned)
      ) {
        failures.push(
          failure("VEHICLE_COLLISION", order.id, "uso exclusivo", `${order.start}-${order.end}`, {
            entityId: order.vehicleId,
            conflictingOrderId: assigned.id,
            interval: [assigned.start, assigned.end],
          }),
        );
      }
    }
  }

  for (const toolId of order.toolIds) {
    const tool = schedule.resources.tools.find(({ id }) => id === toolId);
    if (!tool || tool.quantity < 1) {
      failures.push(
        failure("TOOL_UNAVAILABLE", order.id, "ferramenta disponível", toolId, {
          entityId: toolId,
        }),
      );
      continue;
    }
    if (!tool.divisible) {
      for (const assigned of state.assignedOrders) {
        if (
          assigned.id !== order.id &&
          assigned.toolIds.includes(toolId) &&
          assigned.status !== "CANCELLED" &&
          overlaps(order, assigned)
        ) {
          failures.push(
            failure("TOOL_COLLISION", order.id, "uso exclusivo", `${order.start}-${order.end}`, {
              entityId: toolId,
              conflictingOrderId: assigned.id,
              interval: [assigned.start, assigned.end],
            }),
          );
        }
      }
    }
  }

  const uniqueOrders = new Map(allOrders.map((assigned) => [assigned.id, assigned]));
  for (const part of schedule.resources.parts) {
    const demand = [...uniqueOrders.values()].reduce((sum, assigned) => {
      if (assigned.status === "CANCELLED" || assigned.date !== order.date) return sum;
      return (
        sum +
        (assigned.partRequirements.find(({ partId }) => partId === part.id)?.quantity ?? 0)
      );
    }, 0);
    if (demand > part.stock) {
      failures.push(
        failure("PART_STOCK", order.id, `estoque ${part.stock}`, `demanda ${demand}`, {
          entityId: part.id,
        }),
      );
    }
  }

  return failures;
}

export function validateSchedule(
  schedule: ScheduleSnapshot,
  event?: OperationalEvent,
): ConstraintFailure[] {
  const failures = schedule.orders.flatMap((order) =>
    validateCandidate(
      { order },
      {
        schedule,
        event,
        assignedOrders: schedule.orders.filter(({ id }) => id !== order.id),
        baseVersion: schedule.version,
      },
    ),
  );
  const seen = new Set<string>();
  return failures.filter((item) => {
    const key = [
      item.code,
      item.orderId,
      item.entityId ?? "",
      item.conflictingOrderId ?? "",
      item.expected,
      item.actual,
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
