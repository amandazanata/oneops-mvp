# Arquitetura — estado atual

## Visão geral

O projeto separa um núcleo TypeScript de módulos de interface e persistência. A UI invoca as rotas OneOps e se reidrata com o estado persistido retornado após cada ação.

```text
React UI
  ├─ GET /api/scenario → ScenarioState inicial/hidratado
  └─ POST /api/scenario/action → resposta com ScenarioState persistido
                                  ↓
                    OneOpsScenarioService → solver/impacto/constraints
                                  ↓
                         D1OneOpsRepository → D1 local
```

## Núcleo de domínio e planejamento

- `src/domain/`: tipos, fixture de cinco/seis ordens e métricas.
- `src/planning/constraints.ts`: validações de disponibilidade, competência, certificação, viagem, slots, janela, bloqueio, recursos, peças e versão.
- `src/planning/impact.ts`: impactos diretos e fronteira causal indireta.
- `src/planning/solver.ts`: `solveRecovery` avalia dois candidatos fechados do fixture e classifica recomendado/conservador; `solveExceptionRecovery` trata o preset de escassez.

O solver é determinístico e adequado ao cenário demonstrativo. Apesar de usar validação e ranking reais, não executa uma busca geral por todas as combinações operacionais; os candidatos são deliberadamente limitados ao fixture. `OPTIMAL` deve ser entendido dentro desse espaço fechado.

## Interpretação

`src/ai/interpreter.ts` normaliza texto e reconhece somente as frases de demonstração. O resultado é `DEMO_FALLBACK` ou `UNMATCHED`, com campos ausentes em vez de inferências livres.

Não há adapter OpenAI, SDK, chamada de rede, chave ou integração com API da OpenAI. Qualquer futura integração deve permanecer no servidor, validar saída contra schema fechado e cair no fallback em caso de falha.

## Persistência

`src/persistence/` define o contrato, adapter de memória e `D1OneOpsRepository`. A migration `drizzle/0000_oneops.sql` cria estado, mutações, aplicações de plano, auditoria e triggers de conflito de versão. `.openai/hosting.json` declara a binding D1 `DB`.

Os testes locais cobrem CAS, aplicação idempotente, auditoria e reset para esse adapter. As rotas instanciam `createRuntimeRepository()`, que exige `env.DB`, e a UI consome essas rotas. O fluxo local foi validado no navegador com aplicação do plano conservador, recarga e reset. A D1 remota ainda não foi implantada/validada.

## API atual

`GET /api/scenario` inicializa, quando necessário, o fixture de cinco OS e devolve o `ScenarioState` atual. Falhas de persistência retornam `500` com `PERSISTENCE_ERROR`.

`POST /api/scenario/action` aceita exclusivamente JSON com `action` e `idempotencyKey`; exceto em `RESET`, exige também `expectedVersion` inteiro positivo. Campos extras são rejeitados. As ações são:

- `CREATE_ORDER`: insere a OS-106 previamente revisada;
- `SIMULATE_CARLOS`: exige OS-106, executa o solver com orçamento de 1.500 ms e guarda a simulação;
- `APPLY_RECOMMENDED`: exige uma simulação com plano recomendado, revalida o schedule e o aplica como `Despachante Demo`;
- `APPLY_CONSERVATIVE`: exige uma simulação com plano conservador, revalida o schedule e o aplica como `Despachante Demo`;
- `RESET`: recria o fixture inicial.

Erros de payload/validação retornam `400`; conflitos de versão ou transição retornam `409`; falhas inesperadas retornam `500`. O plano é revalidado imediatamente antes da aplicação. Os IDs de plano usam `PLAN-G<generation>-<policy>-<hash>`; após um reset, uma nova geração produz novos IDs.

## Interface

`src/ui/oneops-workspace.tsx` é um componente cliente que busca o cenário ao montar, envia a ação com versão esperada e chave de idempotência, e aplica a resposta por `hydrate`. Assim, a agenda e o estado de tela são derivados do `ScenarioState` retornado pelo backend. O fluxo local foi validado no navegador para criação, simulação, aplicação do plano conservador, recarga e reset.

## Pendências

1. Implantar e validar a binding D1 em ambiente remoto.
2. Expor o Exception Planner e sua aprovação separada pela API/UI.
3. Adicionar um adapter OpenAI real opcional, mantendo schema fechado e fallback.
