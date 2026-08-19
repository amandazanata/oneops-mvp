import { parseScenarioAction, ScenarioActionPayloadError } from "@/src/application/action-schema";
import {
  InvalidScenarioTransitionError,
  OneOpsScenarioService,
} from "@/src/application/scenario-service";
import {
  RepositoryValidationError,
  VersionConflictError,
} from "@/src/persistence/repository";
import { createRuntimeRepository } from "@/src/persistence/runtime-repository";

function errorResponse(error: unknown): Response {
  if (error instanceof ScenarioActionPayloadError || error instanceof RepositoryValidationError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: 400 },
    );
  }
  if (error instanceof VersionConflictError || error instanceof InvalidScenarioTransitionError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: 409 },
    );
  }
  console.error("Falha ao executar ação do cenário OneOps", error);
  return Response.json(
    { error: { code: "PERSISTENCE_ERROR", message: "A ação não pôde ser concluída." } },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => {
      throw new ScenarioActionPayloadError("O corpo precisa conter JSON válido.");
    });
    const command = parseScenarioAction(payload);
    const service = new OneOpsScenarioService(createRuntimeRepository());
    return Response.json(await service.perform(command));
  } catch (error) {
    return errorResponse(error);
  }
}
