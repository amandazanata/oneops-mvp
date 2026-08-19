# Roteiro de demonstração

## Antes de começar

- Abra a prévia e confirme que a agenda inicia com cinco ordens.
- Explique que o produto usa um cenário sintético, com relógio de demonstração em 19/08/2026 e operação em 20/08/2026.
- Diga que este é um cenário sintético, mas que o fluxo local usa API, D1 e solver reais. A publicação com D1 remota ainda é pendente.

## Roteiro de 3 minutos

1. **0:00–0:30 — Agenda.** Mostre os três técnicos, a OS-101 bloqueada e os atendimentos confirmados. Explique que uma OS dupla aparece na agenda de ambos os técnicos.
2. **0:30–1:05 — Novo pedido.** Clique em “Registrar pedido”, use exatamente a frase: **“Preciso instalar dois aparelhos amanhã à tarde na Vila Mariana.”** Mostre a revisão dos campos e confirme a criação da OS-106.
3. **1:05–1:35 — Imprevisto.** Volte à agenda, clique em “Informar imprevisto” e use exatamente a frase: **“Carlos não poderá trabalhar amanhã.”** Confirme a análise.
4. **1:35–2:20 — Recuperação.** Mostre os três impactos diretos (OS-102, OS-104 e OS-106) e o impacto indireto (OS-105). Compare recomendado e conservador; abra as alternativas descartadas para evidenciar NR10, skills, sobreposição e recursos.
5. **2:20–2:50 — Aprovação e recarga.** Aplique o plano conservador, mostre a agenda reorganizada e recarregue a página: a aplicação persiste no cenário local. Aplique “Restaurar cenário” e confirme o retorno a cinco ordens.
6. **2:50–3:00 — Encerramento.** Destaque a revalidação antes de aplicar: decisões de viabilidade vêm de regras determinísticas, enquanto o fallback de linguagem só reconhece a demonstração.

## Roteiro de 60 segundos

1. Mostre a agenda e diga: “Temos três técnicos e cinco ordens; a OS-101 é bloqueada.”
2. Crie a sexta OS com: **“Preciso instalar dois aparelhos amanhã à tarde na Vila Mariana.”**
3. Registre a indisponibilidade com: **“Carlos não poderá trabalhar amanhã.”**
4. Mostre o recomendado, o impacto em OS-105 e uma alternativa descartada por NR10/sobreposição.
5. Aplique o conservador, recarregue para provar a persistência local e restaure o cenário. Feche informando que a implantação em D1 remota, OpenAI real e a exposição do Exception Planner são os próximos passos.

## Fatos verificados para falar na demonstração

- A suíte local confirma dois planos distintos e válidos para o fixture de seis ordens.
- Para o plano recomendado, os testes confirmam 6/6 atendimentos preservados, 0 cancelamentos, 0 reagendamentos, 4 clientes impactados, 3 trocas de equipe, 1 mudança de horário e 240 minutos deslocados.
- O preset de escassez de kits prova inviabilidade no mesmo dia e o Exception Planner propõe OS-106 para 21/08/2026.
- O E2E local no navegador passou: criar OS-106, simular Carlos, aplicar o plano conservador, recarregar e restaurar o cenário.
