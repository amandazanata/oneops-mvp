import { OneOpsScenarioService } from "@/src/application/scenario-service";
import { createRuntimeRepository } from "@/src/persistence/runtime-repository";

export async function GET() {
  try {
    const service = new OneOpsScenarioService(createRuntimeRepository());
    return Response.json(await service.getScenario());
  } catch (error) {
    console.error("Falha ao carregar o cenário OneOps", error);
    return Response.json(
      { error: { code: "PERSISTENCE_ERROR", message: "Não foi possível carregar a agenda." } },
      { status: 500 },
    );
  }
}
