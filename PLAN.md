# Plano de implementação — OneOps

Status em 19/08/2026: o fluxo local UI → API → D1 → solver está integrado e validado no navegador. A publicação com D1 remota continua pendente.

## Concluído e verificado localmente

- Fixture sintético com cinco OS, sexta OS revisada, três técnicos, recursos e matriz de deslocamento.
- Engine TypeScript determinística com dois planos para a indisponibilidade de Carlos, alternativas descartadas e preset de exceção.
- Fallback determinístico para as duas frases da demonstração.
- Adapter de memória, adapter D1, migration, controle de versão, idempotência e auditoria testados localmente.
- Casos de uso e rotas `GET /api/scenario` e `POST /api/scenario/action`, com payloads fechados, CAS, revalidação antes de aplicar e transições testadas localmente.
- Prévia React conectada às rotas: agenda hidratada do `ScenarioState`, criação da OS-106, simulação, aplicação de plano recomendado ou conservador e reset.
- Fluxo E2E local validado no navegador, incluindo recarga após aplicar o plano conservador e restauração do cenário.
- IDs de plano escopados por geração (`PLAN-G<generation>-...`), evitando colisão entre execuções após reset.

## Próximas etapas, nesta ordem

1. Fazer o deploy remoto com D1 e confirmar migration, persistência, CAS, idempotência, recarga e reset nesse ambiente.
2. Expor o Exception Planner com aprovação separada; hoje ele existe no núcleo, mas não está disponível pela API/UI.
3. Considerar um adapter OpenAI real opcional, sempre com schema fechado e fallback. Não há API OpenAI integrada hoje.

## Critérios de conclusão

- O fluxo remoto com D1 foi publicado e confirmado.
- O Exception Planner está exposto com aprovação separada.
- Qualquer adapter OpenAI real preserva schema fechado, fallback e segredos somente no servidor.
