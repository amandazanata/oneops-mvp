import type { ServiceOrder, Skill, TechnicianId } from "../domain/types.ts";
import type { ScenarioState } from "../persistence/repository.ts";
import type { PlanKind } from "./plan-application.ts";

export type TechnicianName = "Carlos" | "Marina" | "João";
export type WorkspaceView = "agenda" | "intake" | "review" | "recovery" | "applied";

export type UiOrder = {
  id: string;
  service: string;
  shortService: string;
  start: string;
  end: string;
  window: string;
  neighborhood: string;
  technicians: TechnicianName[];
  vehicle: string;
  requirements: string;
  status: "normal" | "confirmed" | "locked";
};

const technicianNames: Record<TechnicianId, TechnicianName> = {
  "TECH-CARLOS": "Carlos",
  "TECH-MARINA": "Marina",
  "TECH-JOAO": "João",
};

const serviceNames: Record<Skill, { long: string; short: string }> = {
  INSTALLATION: { long: "Instalação de split", short: "Instalação" },
  MAINTENANCE: { long: "Manutenção preventiva", short: "Preventiva" },
  CLEANING: { long: "Limpeza e higienização", short: "Limpeza" },
  ELECTRICAL: { long: "Reparo elétrico", short: "Reparo elétrico" },
  GAS_RECHARGE: { long: "Recarga de gás", short: "Recarga de gás" },
};

const toolNames: Record<string, string> = {
  "TOOL-VACUUM-PUMP": "Bomba",
  "TOOL-LADDER": "Escada",
  "TOOL-ELECTRICAL-KIT": "Kit elétrico",
  "TOOL-MANIFOLD": "Manifold",
};

function requirementLabel(order: ServiceOrder): string {
  const labels = [
    ...(order.requiredTeamSize > 1 ? ["Dupla"] : []),
    ...order.requiredCertifications,
    ...order.toolIds
      .map((id) => toolNames[id] ?? id)
      .sort((left, right) => ["Bomba", "Escada", "Kit elétrico", "Manifold"].indexOf(left)
        - ["Bomba", "Escada", "Kit elétrico", "Manifold"].indexOf(right)),
  ];
  if (order.service === "CLEANING" && labels.length === 0) labels.push("Kit de limpeza");
  return labels.join(" · ") || "Sem recurso especial";
}

export function toUiOrders(state: ScenarioState): UiOrder[] {
  return state.snapshot.orders.map((order) => {
    const service = serviceNames[order.service];
    const installationQuantity = order.service === "INSTALLATION" && order.quantity > 1
      ? ` ${order.quantity}×`
      : "";
    return {
      id: order.id,
      service: order.id === "OS-106" ? `Instalação de ${order.quantity} aparelhos` : service.long,
      shortService: `${service.short}${installationQuantity}`,
      start: order.start,
      end: order.end,
      window: `${order.windowStart}–${order.windowEnd}`,
      neighborhood: order.location,
      technicians: order.technicianIds.map((id) => technicianNames[id]),
      vehicle: order.vehicleId ?? "—",
      requirements: requirementLabel(order),
      status: order.locked ? "locked" : order.confirmed ? "confirmed" : "normal",
    };
  });
}

export function viewForState(state: ScenarioState): WorkspaceView {
  if (state.mode === "RECOVERY") return "recovery";
  if (state.mode === "APPLIED") return "applied";
  return "agenda";
}

export function planKindFromState(state: ScenarioState): PlanKind {
  const planId = state.applications.at(-1)?.planId ?? "";
  return planId.includes("CONSERVATIVE") ? "conservative" : "recommended";
}
