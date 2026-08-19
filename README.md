# OneOps

OneOps é uma demonstração de recuperação operacional para uma empresa fictícia de instalação e manutenção de ar-condicionado. Dado o evento “Carlos não poderá trabalhar amanhã.”, a engine procura planos válidos que preservem atendimentos, equipe, horários e recursos sob regras explícitas.

## Estado da prévia

A prévia local apresenta agenda, entrada, revisão, comparação de planos, aprovação e restauração conectadas ao backend. A UI carrega o `ScenarioState` por API, envia ações versionadas e reidrata a agenda com a resposta persistida. O fluxo foi validado no navegador, inclusive a recarga após aplicar o plano conservador e o reset. A URL de publicação não está registrada neste repositório.

O repositório contém fixture, engine TypeScript determinística, análise de impacto, constraints, parser de demonstração, adapters de persistência, casos de uso e rotas. No ambiente local, D1, solver e auditoria estão conectados à interface. A implantação em D1 remota ainda não foi comprovada.

## O que existe

- Dois planos determinísticos para a indisponibilidade de Carlos: recomendado e conservador.
- Regras para disponibilidade, skills, NR10, slots de 15 minutos, janelas, viagens, jornada, bloqueio, veículos, ferramentas e peças.
- Alternativas descartadas com fatos de validação; elas não são aprováveis.
- Fallback `DEMO_FALLBACK` que reconhece as duas frases do roteiro, tolerando caixa, espaços e pontuação final.
- Repositório em memória e adapter D1 com schema de runtime, migration, CAS, idempotência e registros de auditoria, exercitados localmente.
- `GET /api/scenario` para inicializar/carregar o estado e `POST /api/scenario/action` para criar OS-106, simular Carlos, aplicar o recomendado ou o conservador e restaurar o fixture.
- UI conectada a essas rotas, com hidratação após cada ação e recarga de cenário persistido.
- IDs de plano com geração, por exemplo `PLAN-G1-CONSERVATIVE-…`, para manter os planos de cada geração isolados.

## Pendências conhecidas

- Não há integração com a API da OpenAI, SDK da OpenAI ou chave de API neste projeto.
- O deploy remoto com a binding D1 `DB` ainda precisa ser concluído e validado.
- O Exception Planner existe no núcleo, mas ainda não está exposto pela API nem pela UI.

## Rodar localmente

Pré-requisito: Node.js 22.13 ou superior.

```bash
npm install
npm run dev
```

Outros comandos disponíveis:

```bash
npm run lint
npm run build
npm test
npx tsx --test src/domain/*.test.ts src/planning/*.test.ts src/ai/*.test.ts src/persistence/*.test.ts src/application/*.test.ts src/ui/*.test.ts
```

`npm test` constrói a aplicação e verifica o HTML renderizado. A última suíte acima executa os testes de domínio, planejamento, interpretação, persistência, aplicação e casos de uso.

## Documentação

- [Roteiro de demonstração](docs/DEMO.md)
- [Arquitetura e limites de integração](docs/ARCHITECTURE.md)
- [Matriz de testes](docs/TEST-MATRIX.md)
- [Plano de implementação](PLAN.md)
- [Instruções para colaboradores](AGENTS.md)
