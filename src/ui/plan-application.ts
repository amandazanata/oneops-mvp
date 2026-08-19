export type PlanKind = "recommended" | "conservative";

type PlanOrder = {
  id: string;
  start: string;
  end: string;
  technicians: string[];
};

export function applyPlanToOrders<T extends PlanOrder>(orders: T[], plan: PlanKind): T[] {
  return orders.map((order) => {
    if (order.id === "OS-102") {
      return { ...order, technicians: ["Marina", "João"] };
    }
    if (order.id === "OS-104") {
      return { ...order, technicians: ["Marina"] };
    }
    if (order.id === "OS-105") {
      return plan === "recommended"
        ? { ...order, start: "11:30", end: "13:00" }
        : { ...order, start: "14:00", end: "15:30" };
    }
    if (order.id === "OS-106") {
      return plan === "recommended"
        ? { ...order, technicians: ["Marina", "João"] }
        : { ...order, start: "16:00", end: "18:00", technicians: ["Marina", "João"] };
    }
    return order;
  });
}
