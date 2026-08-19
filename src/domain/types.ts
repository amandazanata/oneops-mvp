export type TechnicianId = "TECH-CARLOS" | "TECH-MARINA" | "TECH-JOAO";
export type VehicleId = "V-01" | "V-02";
export type Skill =
  | "INSTALLATION"
  | "MAINTENANCE"
  | "CLEANING"
  | "ELECTRICAL"
  | "GAS_RECHARGE";
export type Certification = "NR10" | "NR35" | "R32";
export type Priority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type OrderStatus = "SCHEDULED" | "RESCHEDULED" | "CANCELLED";
export type SearchProof = "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "ERROR";
export type TerminationReason =
  | "EXHAUSTED"
  | "TIME_LIMIT"
  | "CANCELLED"
  | "ERROR";

export interface AvailabilityInterval {
  readonly date: string;
  readonly start: string;
  readonly end: string;
}

export interface Technician {
  readonly id: TechnicianId;
  readonly name: string;
  readonly skills: readonly Skill[];
  readonly certifications: readonly Certification[];
  readonly base: string;
  readonly availability: readonly AvailabilityInterval[];
  readonly regularJourneyMinutes: number;
  readonly maximumJourneyMinutes: number;
  readonly preferredPartnerIds: readonly TechnicianId[];
  readonly status: "ACTIVE" | "INACTIVE";
}

export interface Vehicle {
  readonly id: VehicleId;
  readonly type: "VAN" | "UTILITY";
  readonly base: string;
  readonly available: boolean;
  readonly capacity: number;
  readonly toolIds: readonly string[];
}

export interface Tool {
  readonly id: string;
  readonly name: string;
  readonly quantity: number;
  readonly divisible: boolean;
  readonly location: string;
  readonly vehicleId?: VehicleId;
}

export interface PartReservation {
  readonly orderId: string;
  readonly quantity: number;
}

export interface Part {
  readonly id: string;
  readonly name: string;
  readonly stock: number;
  readonly reservations: readonly PartReservation[];
}

export interface ResourceSnapshot {
  readonly vehicles: readonly Vehicle[];
  readonly tools: readonly Tool[];
  readonly parts: readonly Part[];
}

export interface PartRequirement {
  readonly partId: string;
  readonly quantity: number;
}

export interface ServiceOrder {
  readonly id: string;
  readonly service: Skill;
  readonly quantity: number;
  readonly customer: string;
  readonly location: string;
  readonly date: string;
  readonly start: string;
  readonly end: string;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly durationMinutes: number;
  readonly priority: Priority;
  readonly requiredTeamSize: number;
  readonly requiredSkills: readonly Skill[];
  readonly requiredCertifications: readonly Certification[];
  readonly technicianIds: readonly TechnicianId[];
  readonly vehicleId?: VehicleId;
  readonly toolIds: readonly string[];
  readonly partRequirements: readonly PartRequirement[];
  readonly confirmed: boolean;
  readonly locked: boolean;
  readonly sourceText?: string;
  readonly version: number;
  readonly status: OrderStatus;
}

export interface ScheduleSnapshot {
  readonly generation: number;
  readonly version: number;
  readonly demoNow: string;
  readonly operationDate: string;
  readonly operationStart: string;
  readonly operationEnd: string;
  readonly technicians: readonly Technician[];
  readonly orders: readonly ServiceOrder[];
  readonly resources: ResourceSnapshot;
  readonly travelMinutes: Readonly<Record<string, number>>;
  readonly preset?: "exception-stock-shortage";
}

export interface OperationalEvent {
  readonly id: string;
  readonly type: "TECHNICIAN_UNAVAILABLE";
  readonly technicianId: TechnicianId;
  readonly date: string;
  readonly start: string;
  readonly end: string;
  readonly sourceText: string;
  readonly createdAt: string;
}

export interface ConstraintFailure {
  readonly code: string;
  readonly orderId: string;
  readonly entityId?: string;
  readonly expected: string;
  readonly actual: string;
  readonly conflictingOrderId?: string;
  readonly interval?: readonly [string, string];
}

export interface Candidate {
  readonly order: ServiceOrder;
}

export interface SearchState {
  readonly schedule: ScheduleSnapshot;
  readonly event?: OperationalEvent;
  readonly assignedOrders: readonly ServiceOrder[];
  readonly baseVersion?: number;
}

export interface PlanChange {
  readonly orderId: string;
  readonly before: ServiceOrder;
  readonly after: ServiceOrder;
  readonly direct: boolean;
}

export interface PlanMetrics {
  readonly totalOrders: number;
  readonly preservedOrders: number;
  readonly cancellations: number;
  readonly reschedules: number;
  readonly impactedCustomers: number;
  readonly indirectChanges: number;
  readonly teamChanges: number;
  readonly timeChanges: number;
  readonly shiftedMinutes: number;
  readonly maximumShiftMinutes: number;
  readonly resourceChanges: number;
  readonly preferredPairLosses: number;
  readonly additionalTravelMinutes: number;
  readonly overtimeMinutes: number;
  readonly loadImbalanceMinutes: number;
  readonly confirmedChanges: number;
  readonly confirmedShiftedMinutes: number;
  readonly communicatedTimeChanges: number;
  readonly hardConstraintViolations: number;
}

export type RankAtom = number | string;

export interface RecoveryPlan {
  readonly id: string;
  readonly baseGeneration: number;
  readonly baseVersion: number;
  readonly policy: "RECOMMENDED" | "CONSERVATIVE" | "EXCEPTION";
  readonly proofStatus: SearchProof;
  readonly terminationReason: TerminationReason;
  readonly changes: readonly PlanChange[];
  readonly schedule: ScheduleSnapshot;
  readonly metrics: PlanMetrics;
  readonly rankVector: readonly RankAtom[];
  readonly conservativeRankVector: readonly RankAtom[];
  readonly canonicalKey: string;
}

export interface ImpactNode {
  readonly id: string;
  readonly type: "EVENT" | "ORDER" | "TECHNICIAN" | "FRONTIER";
  readonly entityId: string;
  readonly relation:
    | "ROOT"
    | "DIRECTLY_AFFECTS"
    | "LOST_TECHNICIAN"
    | "CANDIDATE_CONSIDERED"
    | "BLOCKS_CANDIDATE"
    | "ENTERS_FRONTIER";
  readonly parentId?: string;
}

export interface ImpactAnalysis {
  readonly directOrderIds: readonly string[];
  readonly indirectOrderIds: readonly string[];
  readonly nodes: readonly ImpactNode[];
}

export interface DiscardedAlternative {
  readonly id: string;
  readonly description: string;
  readonly failures: readonly ConstraintFailure[];
}

export interface RecoveryResult {
  readonly plans: readonly RecoveryPlan[];
  readonly recommended?: RecoveryPlan;
  readonly conservative?: RecoveryPlan;
  readonly discardedAlternatives: readonly DiscardedAlternative[];
  readonly impact: ImpactAnalysis;
  readonly nodesVisited: number;
  readonly elapsedMs: number;
  readonly expansionLevel: number;
  readonly proofStatus: SearchProof;
  readonly terminationReason: TerminationReason;
}

