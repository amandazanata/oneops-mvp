# OneOps — guia de contribuição

## Objetivo

OneOps é uma demonstração operacional fictícia para reorganizar uma agenda de serviços de ar-condicionado após a indisponibilidade de um técnico. O núcleo de planejamento é TypeScript determinístico; interpretação de texto e interface não podem decidir se uma agenda é válida.

## Fonte de verdade e limites atuais

- O fixture e as regras estão em `src/domain/` e `src/planning/`.
- `src/ai/interpreter.ts` contém somente o fallback determinístico para as duas frases da demonstração. Não há integração com a API da OpenAI neste repositório.
- Há adapters de memória e D1 em `src/persistence/`, migration em `drizzle/0000_oneops.sql` e binding `DB` em `.openai/hosting.json`.
- `GET /api/scenario` inicializa/carrega o cenário D1; `POST /api/scenario/action` aceita ações fechadas, com CAS quando aplicável. Os casos de uso ficam em `src/application/`.
- `src/ui/oneops-workspace.tsx` carrega o cenário por `GET`, executa ações por `POST` e hidrata a agenda a partir do estado retornado. O fluxo local UI → API → D1 → solver foi validado no navegador, inclusive após recarregar e restaurar o cenário.
- IDs de plano são escopados pela geração (`PLAN-G<generation>-<policy>-<hash>`). Preserve esse isolamento ao tocar em reset, aplicação ou auditoria.

## Regras que não podem regredir

- Hard constraints vencem qualquer texto gerado ou escolha visual.
- Uma OS bloqueada não muda; o plano precisa ser revalidado antes de aplicar.
- Preserve determinismo, ordenação estável e status de prova honestos (`OPTIMAL`, `FEASIBLE`, `INFEASIBLE`, `ERROR`).
- Nunca apresente um timeout como inviabilidade, nem uma solução viável como ótima sem prova.
- O cenário é sintético; não introduza dados pessoais nem envio real de mensagens.

## Fluxo de trabalho

1. Leia `PLAN.md`, `docs/ARCHITECTURE.md` e os testes próximos ao módulo alterado.
2. Faça a alteração mínima, com teste que exponha o comportamento esperado.
3. Execute, quando aplicável:

   ```bash
   npm run lint
   npm run build
   npx tsx --test src/domain/*.test.ts src/planning/*.test.ts src/ai/*.test.ts src/persistence/*.test.ts src/application/*.test.ts src/ui/*.test.ts
   npm test
   ```

4. Atualize `docs/TEST-MATRIX.md` somente com evidência executada e registre limitações reais.

## Convenções

- TypeScript estrito, funções pequenas e contratos explícitos.
- Mantenha imports de domínio independentes de React, HTTP e Cloudflare.
- Não acrescente uma dependência de IA sem schema fechado, fallback, tratamento de falha e segredo exclusivamente no servidor.
- Não altere o fixture ou métricas esperadas apenas para fazer a interface parecer correta.
