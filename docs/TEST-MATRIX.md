# Matriz de testes

Data da última execução registrada: 19/08/2026. Comando executado:

```bash
npx tsx --test src/domain/*.test.ts src/planning/*.test.ts src/ai/*.test.ts src/persistence/*.test.ts src/application/*.test.ts src/ui/*.test.ts
```

Resultado: 54 testes aprovados, 0 falhas, em aproximadamente 15,9 s. Além da suíte, o E2E local no navegador foi validado: criar OS-106, simular Carlos, aplicar o plano conservador, recarregar e restaurar o cenário.

| Área | Cobertura comprovada | Resultado | Lacuna para conclusão |
|---|---|---|---|
| Fixture e métricas | Cinco/seis OS, recursos, matriz simétrica, métricas dos planos | Aprovado localmente | — |
| Interpretação | As duas frases exatas, normalização e campos ausentes | Aprovado localmente | Adapter OpenAI real pendente |
| Constraints e solver | Regras, dois planos, descartes, reprodutibilidade, timeout, exceção e IDs por geração | Aprovado localmente | Exception Planner ainda não exposto |
| D1 | Schema de runtime, CAS, concorrência, batch, auditoria e reset | Aprovado localmente | Deploy/validação em D1 remota |
| Casos de uso/API | Payloads fechados; criar, simular, aplicar recomendado/conservador e reset; revalidação e idempotência | Aprovado localmente | — |
| UI/E2E local | Hidratação por API, aplicação conservadora, recarga e reset no navegador | Aprovado | — |

## Métricas verificadas do fixture recomendado

Os testes de domínio e solver confirmam: 6 ordens preservadas em 6, 0 cancelamentos, 0 reagendamentos, 4 clientes impactados, 3 trocas de equipe, 1 mudança de horário, 240 minutos deslocados, maior deslocamento de 240 minutos e 0 violações de hard constraint.

Esses números pertencem ao fixture executado localmente e são disponibilizados à UI pelo resultado persistido da simulação. A confirmação equivalente em ambiente remoto depende do deploy D1 pendente.
