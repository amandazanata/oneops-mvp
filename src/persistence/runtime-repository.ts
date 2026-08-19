import { env } from "cloudflare:workers";

import { D1OneOpsRepository } from "./d1-repository.ts";

export function createRuntimeRepository(): D1OneOpsRepository {
  if (!env.DB) throw new Error("A binding D1 `DB` não está disponível.");
  return new D1OneOpsRepository(env.DB);
}
