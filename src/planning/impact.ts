import type {
  ImpactAnalysis,
  ImpactNode,
  OperationalEvent,
  ScheduleSnapshot,
  ServiceOrder,
  Technician,
} from "../domain/types.ts";

const toMinutes = (time: string): number => {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return hour * 60 + minute;
};

const overlaps = (left: ServiceOrder, right: ServiceOrder): boolean =>
  left.date === right.date &&
  toMinutes(left.start) < toMinutes(right.end) &&
  toMinutes(right.start) < toMinutes(left.end);

const eligibleReplacement = (
  order: ServiceOrder,
  technician: Technician,
  event: OperationalEvent,
): boolean =>
  technician.id !== event.technicianId &&
  technician.status === "ACTIVE" &&
  !order.technicianIds.includes(technician.id) &&
  order.requiredSkills.every((skill) => technician.skills.includes(skill)) &&
  order.requiredCertifications.every((certification) =>
    technician.certifications.includes(certification),
  );

export function analyzeImpact(
  schedule: ScheduleSnapshot,
  event: OperationalEvent,
): ImpactAnalysis {
  const directOrders = schedule.orders
    .filter(
      (order) =>
        order.date === event.date &&
        order.technicianIds.includes(event.technicianId) &&
        toMinutes(order.start) < toMinutes(event.end) &&
        toMinutes(event.start) < toMinutes(order.end),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  const directIds = new Set(directOrders.map(({ id }) => id));
  const indirectIds = new Set<string>();
  const nodes: ImpactNode[] = [
    {
      id: `impact-event-${event.id}`,
      type: "EVENT",
      entityId: event.id,
      relation: "ROOT",
    },
  ];

  for (const order of directOrders) {
    const orderNodeId = `impact-direct-${order.id}`;
    const lostNodeId = `impact-lost-${order.id}-${event.technicianId}`;
    nodes.push(
      {
        id: orderNodeId,
        type: "ORDER",
        entityId: order.id,
        relation: "DIRECTLY_AFFECTS",
        parentId: `impact-event-${event.id}`,
      },
      {
        id: lostNodeId,
        type: "TECHNICIAN",
        entityId: event.technicianId,
        relation: "LOST_TECHNICIAN",
        parentId: orderNodeId,
      },
    );

    const candidates = schedule.technicians
      .filter((technician) => eligibleReplacement(order, technician, event))
      .sort((left, right) => left.id.localeCompare(right.id));
    for (const technician of candidates) {
      const candidateNodeId = `impact-candidate-${order.id}-${technician.id}`;
      nodes.push({
        id: candidateNodeId,
        type: "TECHNICIAN",
        entityId: technician.id,
        relation: "CANDIDATE_CONSIDERED",
        parentId: lostNodeId,
      });

      const blockers = schedule.orders
        .filter(
          (other) =>
            !directIds.has(other.id) &&
            !other.locked &&
            other.technicianIds.includes(technician.id) &&
            overlaps(order, other),
        )
        .sort((left, right) => left.id.localeCompare(right.id));
      for (const blocker of blockers) {
        indirectIds.add(blocker.id);
        const blockerNodeId = `impact-blocker-${order.id}-${technician.id}-${blocker.id}`;
        nodes.push(
          {
            id: blockerNodeId,
            type: "ORDER",
            entityId: blocker.id,
            relation: "BLOCKS_CANDIDATE",
            parentId: candidateNodeId,
          },
          {
            id: `impact-frontier-${order.id}-${technician.id}-${blocker.id}`,
            type: "FRONTIER",
            entityId: blocker.id,
            relation: "ENTERS_FRONTIER",
            parentId: blockerNodeId,
          },
        );
      }
    }
  }

  return {
    directOrderIds: [...directIds].sort(),
    indirectOrderIds: [...indirectIds].sort(),
    nodes,
  };
}
