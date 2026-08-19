import type {
  OperationalEvent,
  ScheduleSnapshot,
  ServiceOrder,
  Technician,
} from "./types.ts";

const DATE = "2026-08-20";

const technicians: readonly Technician[] = [
  {
    id: "TECH-CARLOS",
    name: "Carlos",
    skills: ["INSTALLATION", "MAINTENANCE", "CLEANING", "ELECTRICAL", "GAS_RECHARGE"],
    certifications: ["NR10", "NR35", "R32"],
    base: "Campo Belo",
    availability: [
      { date: DATE, start: "07:00", end: "19:00" },
      { date: "2026-08-21", start: "07:00", end: "19:00" },
    ],
    regularJourneyMinutes: 480,
    maximumJourneyMinutes: 600,
    preferredPartnerIds: ["TECH-MARINA"],
    status: "ACTIVE",
  },
  {
    id: "TECH-JOAO",
    name: "João",
    skills: ["INSTALLATION", "MAINTENANCE", "CLEANING", "GAS_RECHARGE"],
    certifications: ["R32"],
    base: "Moema",
    availability: [
      { date: DATE, start: "07:00", end: "19:00" },
      { date: "2026-08-21", start: "07:00", end: "19:00" },
    ],
    regularJourneyMinutes: 480,
    maximumJourneyMinutes: 600,
    preferredPartnerIds: ["TECH-MARINA"],
    status: "ACTIVE",
  },
  {
    id: "TECH-MARINA",
    name: "Marina",
    skills: ["INSTALLATION", "MAINTENANCE", "CLEANING", "ELECTRICAL"],
    certifications: ["NR10", "NR35"],
    base: "Vila Mariana",
    availability: [
      { date: DATE, start: "07:00", end: "19:00" },
      { date: "2026-08-21", start: "07:00", end: "19:00" },
    ],
    regularJourneyMinutes: 480,
    maximumJourneyMinutes: 600,
    preferredPartnerIds: ["TECH-CARLOS"],
    status: "ACTIVE",
  },
];

const orders: readonly ServiceOrder[] = [
  {
    id: "OS-101", service: "MAINTENANCE", quantity: 1,
    customer: "Cliente Demonstração 101", location: "Moema", date: DATE,
    start: "07:00", end: "08:30", windowStart: "07:00", windowEnd: "08:30",
    durationMinutes: 90, priority: "HIGH", requiredTeamSize: 1,
    requiredSkills: ["MAINTENANCE"], requiredCertifications: [],
    technicianIds: ["TECH-JOAO"], vehicleId: "V-02", toolIds: [],
    partRequirements: [], confirmed: true, locked: true, version: 1, status: "SCHEDULED",
  },
  {
    id: "OS-102", service: "INSTALLATION", quantity: 2,
    customer: "Cliente Demonstração 102", location: "Vila Mariana", date: DATE,
    start: "09:00", end: "11:00", windowStart: "09:00", windowEnd: "11:00",
    durationMinutes: 120, priority: "HIGH", requiredTeamSize: 2,
    requiredSkills: ["INSTALLATION"], requiredCertifications: [],
    technicianIds: ["TECH-CARLOS", "TECH-MARINA"], vehicleId: "V-01",
    toolIds: ["TOOL-LADDER", "TOOL-VACUUM-PUMP"],
    partRequirements: [{ partId: "PART-INSTALL-KIT", quantity: 1 }],
    confirmed: true, locked: false, version: 1, status: "SCHEDULED",
  },
  {
    id: "OS-103", service: "CLEANING", quantity: 1,
    customer: "Cliente Demonstração 103", location: "Saúde", date: DATE,
    start: "11:30", end: "12:30", windowStart: "11:30", windowEnd: "13:00",
    durationMinutes: 60, priority: "NORMAL", requiredTeamSize: 1,
    requiredSkills: ["CLEANING"], requiredCertifications: [],
    technicianIds: ["TECH-MARINA"], vehicleId: "V-01", toolIds: [],
    partRequirements: [], confirmed: false, locked: false, version: 1, status: "SCHEDULED",
  },
  {
    id: "OS-104", service: "ELECTRICAL", quantity: 1,
    customer: "Cliente Demonstração 104", location: "Pinheiros", date: DATE,
    start: "13:00", end: "15:00", windowStart: "13:00", windowEnd: "15:00",
    durationMinutes: 120, priority: "URGENT", requiredTeamSize: 1,
    requiredSkills: ["ELECTRICAL"], requiredCertifications: ["NR10"],
    technicianIds: ["TECH-CARLOS"], vehicleId: "V-01", toolIds: ["TOOL-ELECTRICAL-KIT"],
    partRequirements: [], confirmed: true, locked: false, version: 1, status: "SCHEDULED",
  },
  {
    id: "OS-105", service: "GAS_RECHARGE", quantity: 1,
    customer: "Cliente Demonstração 105", location: "Perdizes", date: DATE,
    start: "15:30", end: "17:00", windowStart: "11:30", windowEnd: "17:00",
    durationMinutes: 90, priority: "HIGH", requiredTeamSize: 1,
    requiredSkills: ["GAS_RECHARGE"], requiredCertifications: ["R32"],
    technicianIds: ["TECH-JOAO"], vehicleId: "V-02", toolIds: ["TOOL-MANIFOLD"],
    partRequirements: [{ partId: "PART-R32" , quantity: 1 }],
    confirmed: true, locked: false, version: 1, status: "SCHEDULED",
  },
];

const reviewedOrder: ServiceOrder = {
  id: "OS-106", service: "INSTALLATION", quantity: 2,
  customer: "Cliente Demonstração 106", location: "Vila Mariana", date: DATE,
  start: "15:30", end: "17:30", windowStart: "13:00", windowEnd: "18:00",
  durationMinutes: 120, priority: "NORMAL", requiredTeamSize: 2,
  requiredSkills: ["INSTALLATION"], requiredCertifications: [],
  technicianIds: ["TECH-CARLOS", "TECH-MARINA"], vehicleId: "V-01",
  toolIds: ["TOOL-LADDER", "TOOL-VACUUM-PUMP"],
  partRequirements: [{ partId: "PART-INSTALL-KIT", quantity: 1 }],
  confirmed: false, locked: false,
  sourceText: "Preciso instalar dois aparelhos amanhã à tarde na Vila Mariana.",
  version: 1, status: "SCHEDULED",
};

const places = ["Campo Belo", "Vila Mariana", "Saúde", "Moema", "Pinheiros", "Perdizes"] as const;
const matrix = [
  [0, 20, 25, 15, 35, 40],
  [20, 0, 15, 15, 25, 30],
  [25, 15, 0, 20, 30, 35],
  [15, 15, 20, 0, 30, 35],
  [35, 25, 30, 30, 0, 20],
  [40, 30, 35, 35, 20, 0],
] as const;

const travelMinutes = Object.fromEntries(
  places.flatMap((from, row) =>
    places.map((to, column) => [`${from}|${to}`, matrix[row][column]]),
  ),
);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function buildFixture(allOrders: readonly ServiceOrder[]): ScheduleSnapshot {
  return deepFreeze({
    generation: 1,
    version: 1,
    demoNow: "2026-08-19T10:00:00-03:00",
    operationDate: DATE,
    operationStart: "07:00",
    operationEnd: "19:00",
    technicians,
    orders: [...allOrders].sort((left, right) => left.id.localeCompare(right.id)),
    resources: {
      vehicles: [
        { id: "V-01", type: "VAN", base: "Vila Mariana", available: true, capacity: 4,
          toolIds: ["TOOL-ELECTRICAL-KIT", "TOOL-LADDER", "TOOL-VACUUM-PUMP"] },
        { id: "V-02", type: "UTILITY", base: "Moema", available: true, capacity: 2,
          toolIds: ["TOOL-MANIFOLD"] },
      ],
      tools: [
        { id: "TOOL-ELECTRICAL-KIT", name: "Kit elétrico", quantity: 1, divisible: false, location: "Vila Mariana", vehicleId: "V-01" },
        { id: "TOOL-LADDER", name: "Escada", quantity: 1, divisible: false, location: "Vila Mariana", vehicleId: "V-01" },
        { id: "TOOL-MANIFOLD", name: "Manifold", quantity: 1, divisible: false, location: "Moema", vehicleId: "V-02" },
        { id: "TOOL-VACUUM-PUMP", name: "Bomba de vácuo", quantity: 1, divisible: false, location: "Vila Mariana", vehicleId: "V-01" },
      ],
      parts: [
        { id: "PART-INSTALL-KIT", name: "Kit de instalação", stock: 2,
          reservations: [{ orderId: "OS-102", quantity: 1 }, { orderId: "OS-106", quantity: 1 }] },
        { id: "PART-R32", name: "Carga de gás R32", stock: 1,
          reservations: [{ orderId: "OS-105", quantity: 1 }] },
      ],
    },
    travelMinutes,
  });
}

export function createDemoFixture(): ScheduleSnapshot {
  return buildFixture(orders);
}

export function createRecoveryFixture(): ScheduleSnapshot {
  return buildFixture([...orders, reviewedOrder]);
}

export function createCarlosUnavailableEvent(): OperationalEvent {
  return deepFreeze({
    id: "EVENT-CARLOS-UNAVAILABLE",
    type: "TECHNICIAN_UNAVAILABLE",
    technicianId: "TECH-CARLOS",
    date: DATE,
    start: "07:00",
    end: "19:00",
    sourceText: "Carlos não poderá trabalhar amanhã.",
    createdAt: "2026-08-19T10:00:00-03:00",
  });
}

export function createExceptionStockShortageFixture(): ScheduleSnapshot {
  const fixture = createRecoveryFixture();
  const parts = fixture.resources.parts.map((part) =>
    part.id === "PART-INSTALL-KIT" ? { ...part, stock: 1 } : part,
  );
  return deepFreeze({
    ...fixture,
    preset: "exception-stock-shortage" as const,
    resources: { ...fixture.resources, parts },
  });
}

export function getTravelMinutes(
  schedule: ScheduleSnapshot,
  from: string,
  to: string,
): number | undefined {
  return schedule.travelMinutes[`${from}|${to}`];
}
