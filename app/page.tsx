import type { Metadata } from "next";
import { OneOpsWorkspace } from "@/src/ui/oneops-workspace";

export const metadata: Metadata = {
  title: "OneOps · Agenda operacional",
  description: "Workspace de recuperação operacional para equipes de serviço.",
};

export default function Home() {
  return <OneOpsWorkspace />;
}
