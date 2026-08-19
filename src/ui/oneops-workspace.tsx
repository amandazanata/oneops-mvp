"use client";

import { useEffect, useMemo, useState } from "react";
import type { ScenarioState } from "../persistence/repository";
import type { PlanKind } from "./plan-application";
import {
  planKindFromState,
  toUiOrders,
  viewForState,
  type TechnicianName,
  type UiOrder,
  type WorkspaceView,
} from "./scenario-adapter";

type View = WorkspaceView;
type InputKind = "request" | "event";

const technicians: Array<{
  name: TechnicianName;
  initials: string;
  skills: string;
  tone: string;
}> = [
  { name: "Carlos", initials: "CA", skills: "Instalação · Elétrica · NR10", tone: "navy" },
  { name: "Marina", initials: "MA", skills: "Instalação · Elétrica · NR10", tone: "teal" },
  { name: "João", initials: "JO", skills: "Instalação · Gás · R32", tone: "rust" },
];

const initialOrders: UiOrder[] = [
  {
    id: "OS-101",
    service: "Manutenção preventiva",
    shortService: "Preventiva",
    start: "07:00",
    end: "08:30",
    window: "07:00–08:30",
    neighborhood: "Moema",
    technicians: ["João"],
    vehicle: "V-02",
    requirements: "Manifold",
    status: "locked",
  },
  {
    id: "OS-102",
    service: "Instalação de split",
    shortService: "Instalação",
    start: "09:00",
    end: "11:00",
    window: "09:00–11:00",
    neighborhood: "Vila Mariana",
    technicians: ["Carlos", "Marina"],
    vehicle: "V-01",
    requirements: "Dupla · Bomba · Escada",
    status: "confirmed",
  },
  {
    id: "OS-103",
    service: "Limpeza e higienização",
    shortService: "Limpeza",
    start: "11:30",
    end: "12:30",
    window: "11:30–13:00",
    neighborhood: "Saúde",
    technicians: ["Marina"],
    vehicle: "V-01",
    requirements: "Kit de limpeza",
    status: "normal",
  },
  {
    id: "OS-104",
    service: "Reparo elétrico",
    shortService: "Reparo elétrico",
    start: "13:00",
    end: "15:00",
    window: "13:00–15:00",
    neighborhood: "Pinheiros",
    technicians: ["Carlos"],
    vehicle: "V-01",
    requirements: "NR10 · Kit elétrico",
    status: "confirmed",
  },
  {
    id: "OS-105",
    service: "Recarga de gás",
    shortService: "Recarga de gás",
    start: "15:30",
    end: "17:00",
    window: "11:30–17:00",
    neighborhood: "Perdizes",
    technicians: ["João"],
    vehicle: "V-02",
    requirements: "R32 · Manifold",
    status: "confirmed",
  },
];

const requestPhrase = "Preciso instalar dois aparelhos amanhã à tarde na Vila Mariana.";
const eventPhrase = "Carlos não poderá trabalhar amanhã.";

type ScenarioActionName =
  | "CREATE_ORDER"
  | "SIMULATE_CARLOS"
  | "APPLY_RECOMMENDED"
  | "APPLY_CONSERVATIVE"
  | "RESET";

type ScenarioActionResponse = {
  state: ScenarioState;
  alreadyApplied?: boolean;
};

function idempotencyKey(action: ScenarioActionName): string {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `oneops-${action.toLowerCase()}-${suffix}`;
}

function toMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function timelineStyle(order: UiOrder) {
  const start = ((toMinutes(order.start) - 7 * 60) / (12 * 60)) * 100;
  const width = ((toMinutes(order.end) - toMinutes(order.start)) / (12 * 60)) * 100;
  return { left: `${start}%`, width: `${Math.max(width, 7.5)}%` };
}

function StatusTag({ status }: { status: UiOrder["status"] }) {
  if (status === "locked") return <span className="order-tag locked">Bloqueada</span>;
  if (status === "confirmed") return <span className="order-tag confirmed">Confirmada</span>;
  return <span className="order-tag normal">Planejada</span>;
}

function Agenda({ orders }: { orders: UiOrder[] }) {
  const hours = Array.from({ length: 13 }, (_, index) => `${String(index + 7).padStart(2, "0")}:00`);

  return (
    <section className="agenda-surface" aria-labelledby="agenda-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">QUINTA-FEIRA · 20 AGO 2026</p>
          <h2 id="agenda-title">Agenda operacional</h2>
        </div>
        <div className="agenda-summary" aria-label="Resumo da agenda">
          <strong>{orders.length}</strong> ordens
          <span aria-hidden="true">·</span>
          <strong>3</strong> técnicos
          <span aria-hidden="true">·</span>
          <strong>0</strong> conflitos
        </div>
      </div>

      <div className="timeline-shell">
        <div className="timeline-hours" aria-hidden="true">
          <span className="technician-spacer">Técnico</span>
          <div className="hour-grid">
            {hours.map((hour) => <span key={hour}>{hour}</span>)}
          </div>
        </div>

        {technicians.map((technician) => {
          const technicianOrders = orders.filter((order) => order.technicians.includes(technician.name));
          return (
            <div className="timeline-row" key={technician.name}>
              <div className="technician-cell">
                <span className={`avatar ${technician.tone}`}>{technician.initials}</span>
                <span>
                  <strong>{technician.name}</strong>
                  <small>{technician.skills}</small>
                </span>
              </div>
              <div className="timeline-track" aria-label={`Agenda de ${technician.name}`}>
                <div className="track-lines" aria-hidden="true" />
                {technicianOrders.map((order) => (
                  <article
                    className={`order-block ${order.status}`}
                    key={`${technician.name}-${order.id}`}
                    style={timelineStyle(order)}
                    aria-label={`${order.id}, ${order.service}, ${order.start} às ${order.end}, ${order.neighborhood}`}
                    title={`${order.id} · ${order.service} · ${order.neighborhood}`}
                  >
                    <div className="order-block-top">
                      <strong>{order.id}</strong>
                      {order.technicians.length === 2 && <span className="team-mark">2×</span>}
                    </div>
                    <span>{order.shortService}</span>
                    <small>{order.start}–{order.end} · {order.neighborhood}</small>
                  </article>
                ))}
              </div>
              <div className="mobile-order-list">
                {technicianOrders.map((order) => (
                  <article className="mobile-order" key={`mobile-${technician.name}-${order.id}`}>
                    <div>
                      <strong>{order.start}</strong>
                      <span>{order.end}</span>
                    </div>
                    <div>
                      <div className="mobile-order-title"><strong>{order.id}</strong><StatusTag status={order.status} /></div>
                      <p>{order.service}</p>
                      <small>{order.neighborhood} · {order.vehicle} · {order.requirements}</small>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="agenda-legend">
        <span><i className="legend-swatch confirmed" /> Confirmada</span>
        <span><i className="legend-swatch locked" /> Bloqueada</span>
        <span><i className="legend-swatch normal" /> Planejada</span>
        <span className="legend-note">A OS em dupla aparece na linha de cada integrante.</span>
      </div>
    </section>
  );
}

function Intake({
  kind,
  text,
  setText,
  onBack,
  onInterpret,
}: {
  kind: InputKind;
  text: string;
  setText: (value: string) => void;
  onBack: () => void;
  onInterpret: () => void;
}) {
  const phrase = kind === "request" ? requestPhrase : eventPhrase;
  return (
    <section className="focused-workspace" aria-labelledby="intake-title">
      <button className="back-link" onClick={onBack}>← Voltar para a agenda</button>
      <div className="focus-header">
        <p className="eyebrow">ENTRADA OPERACIONAL</p>
        <h2 id="intake-title">{kind === "request" ? "Registrar novo pedido" : "Informar imprevisto"}</h2>
        <p>{kind === "request" ? "Descreva o pedido como ele chegou. Você revisará os dados antes de criar a OS." : "Descreva o que mudou. Nada será reorganizado sem sua aprovação."}</p>
      </div>
      <div className="intake-layout">
        <div className="input-panel">
          <label htmlFor="operational-text">Texto original</label>
          <textarea
            id="operational-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={phrase}
            rows={6}
          />
          <button className="example-chip" onClick={() => setText(phrase)}>Usar frase da demonstração</button>
          <div className="form-actions">
            <button className="button secondary" onClick={onBack}>Cancelar</button>
            <button className="button primary" onClick={onInterpret} disabled={!text.trim()}>Interpretar texto →</button>
          </div>
        </div>
        <aside className="guardrail-panel">
          <span className="guardrail-icon" aria-hidden="true">✓</span>
          <h3>Você mantém o controle</h3>
          <p>A interpretação organiza os dados. A engine valida horários, deslocamentos, equipe e recursos.</p>
          <ul>
            <li>Nenhuma mudança automática</li>
            <li>Restrições verificadas por regras</li>
            <li>Aprovação humana obrigatória</li>
          </ul>
        </aside>
      </div>
    </section>
  );
}

function Review({ kind, text, busy, onBack, onConfirm }: { kind: InputKind; text: string; busy: boolean; onBack: () => void; onConfirm: () => void }) {
  const requestFields = [
    ["Intenção", "Criar ordem de serviço", "100%"],
    ["Serviço", "Instalação de ar-condicionado split", "98%"],
    ["Quantidade", "2 aparelhos", "100%"],
    ["Data", "20/08/2026 (amanhã)", "100%"],
    ["Janela", "13:00–18:00", "94%"],
    ["Bairro", "Vila Mariana", "100%"],
    ["Duração", "120 min · catálogo", "100%"],
    ["Equipe provável", "2 técnicos", "96%"],
  ];
  const eventFields = [
    ["Intenção", "Registrar indisponibilidade", "100%"],
    ["Evento", "Técnico indisponível", "100%"],
    ["Técnico", "Carlos", "100%"],
    ["Data", "20/08/2026 (amanhã)", "100%"],
    ["Intervalo", "07:00–19:00", "98%"],
    ["Abrangência", "Dia inteiro", "100%"],
  ];
  const fields = kind === "request" ? requestFields : eventFields;

  return (
    <section className="focused-workspace" aria-labelledby="review-title">
      <button className="back-link" onClick={onBack}>← Editar texto</button>
      <div className="focus-header review-heading">
        <div>
          <p className="eyebrow">REVISÃO OBRIGATÓRIA</p>
          <h2 id="review-title">Confira a estrutura extraída</h2>
        </div>
        <span className="mode-badge">Modo de demonstração</span>
      </div>
      <blockquote className="original-text">“{text}”</blockquote>
      <div className="field-table" role="table" aria-label="Campos extraídos">
        {fields.map(([label, value, confidence]) => (
          <div className="field-row" role="row" key={label}>
            <span role="cell">{label}</span>
            <strong role="cell">{value}</strong>
            <span role="cell" className="confidence">✓ {confidence}</span>
          </div>
        ))}
      </div>
      <div className="review-footer">
        <p><strong>Nenhum campo obrigatório ausente.</strong><br />A duração vem do catálogo e não da interpretação.</p>
        <div className="form-actions">
          <button className="button secondary" onClick={onBack}>Voltar</button>
          <button className="button primary" onClick={onConfirm} disabled={busy}>{busy ? "Processando…" : kind === "request" ? "Confirmar e criar OS →" : "Confirmar e analisar impacto →"}</button>
        </div>
      </div>
    </section>
  );
}

const recommendedChanges = [
  ["OS-102", "Carlos + Marina", "Marina + João", "09:00", "09:00", "Direto"],
  ["OS-104", "Carlos", "Marina", "13:00", "13:00", "Direto"],
  ["OS-105", "João", "João", "15:30", "11:30", "Indireto"],
  ["OS-106", "Carlos + Marina", "Marina + João", "15:30", "15:30", "Direto"],
];

const conservativeChanges = [
  ["OS-102", "Carlos + Marina", "Marina + João", "09:00", "09:00", "Direto"],
  ["OS-104", "Carlos", "Marina", "13:00", "13:00", "Direto"],
  ["OS-105", "João", "João", "15:30", "14:00", "Indireto"],
  ["OS-106", "Carlos + Marina", "Marina + João", "15:30", "16:00", "Direto"],
];

function Recovery({
  scenario,
  busy,
  onApprove,
  onBack,
}: {
  scenario: ScenarioState | null;
  busy: boolean;
  onApprove: (plan: PlanKind) => void;
  onBack: () => void;
}) {
  const [plan, setPlan] = useState<PlanKind>("recommended");
  const [showDiscarded, setShowDiscarded] = useState(false);
  const changes = plan === "recommended" ? recommendedChanges : conservativeChanges;
  const isRecommended = plan === "recommended";
  const result = scenario?.simulation?.result;
  const selectedPlan = isRecommended ? result?.recommended : result?.conservative;
  const metrics = selectedPlan?.metrics;

  return (
    <section className="recovery-workspace" aria-labelledby="recovery-title">
      <button className="back-link" onClick={onBack}>← Voltar para a agenda</button>
      <div className="recovery-titlebar">
        <div>
          <p className="eyebrow disruption">IMPREVISTO CONFIRMADO</p>
          <h2 id="recovery-title">Carlos indisponível · 20/08</h2>
          <p>{result?.impact.directOrderIds.length ?? 3} impactos diretos · {result?.impact.indirectOrderIds.length ?? 1} impacto indireto · busca concluída em {result?.elapsedMs ?? 38} ms</p>
        </div>
        <div className="proof-badge"><span>✓</span><strong>{result?.proofStatus === "OPTIMAL" ? "Ótimo comprovado" : "Plano viável"}</strong><small>{result?.terminationReason === "EXHAUSTED" ? "espaço mínimo esgotado" : "busca limitada"}</small></div>
      </div>

      <div className="impact-strip">
        <strong>Impacto encontrado</strong>
        <span><b>Direto</b> OS-102, OS-104, OS-106</span>
        <span><b>Indireto</b> OS-105 disputa João</span>
      </div>

      <div className="plan-tabs" aria-label="Planos de recuperação">
        <button aria-pressed={isRecommended} className={isRecommended ? "active" : ""} onClick={() => setPlan("recommended")}>
          <span className="tab-kicker">RECOMENDADO</span><strong>Menor reorganização</strong><small>1 horário alterado</small>
        </button>
        <button aria-pressed={!isRecommended} className={!isRecommended ? "active" : ""} onClick={() => setPlan("conservative")}>
          <span className="tab-kicker">CONSERVADOR</span><strong>Protege confirmadas</strong><small>2 horários alterados</small>
        </button>
      </div>

      <div className="recovery-grid">
        <div className="plan-detail">
          <div className="metric-summary">
            <div><strong>{metrics ? `${metrics.preservedOrders}/${metrics.totalOrders}` : "6/6"}</strong><span>atendimentos preservados</span></div>
            <div><strong>{metrics?.cancellations ?? 0}</strong><span>cancelamentos</span></div>
            <div><strong>{metrics?.reschedules ?? 0}</strong><span>reagendamentos</span></div>
            <div><strong>{metrics?.impactedCustomers ?? 4}</strong><span>clientes impactados</span></div>
            <div><strong>{metrics?.teamChanges ?? 3}</strong><span>trocas de equipe</span></div>
            <div><strong>{metrics?.timeChanges ?? (isRecommended ? 1 : 2)}</strong><span>horários alterados</span></div>
          </div>

          <div className="comparison-header"><h3>Antes e depois</h3><span>0 conflitos · {metrics?.hardConstraintViolations ?? 0} violações obrigatórias</span></div>
          <div className="changes-list">
            {changes.map(([id, oldTech, newTech, oldTime, newTime, impact]) => (
              <article className="change-row" key={id}>
                <div className="change-id"><strong>{id}</strong><span className={impact === "Direto" ? "impact direct" : "impact indirect"}>{impact}</span></div>
                <div className="state-before"><small>ANTES</small><strong>{oldTime}</strong><span>{oldTech}</span></div>
                <span className="change-arrow" aria-hidden="true">→</span>
                <div className="state-after"><small>PROPOSTO</small><strong>{newTime}</strong><span>{newTech}</span></div>
              </article>
            ))}
          </div>
        </div>

        <aside className="recovery-aside">
          <div className="reason-panel">
            <p className="eyebrow">POR QUE ESTE PLANO</p>
            <h3>{isRecommended ? "Preserva tudo com uma única mudança de horário" : "Reduz a mudança na OS confirmada"}</h3>
            <p>{isRecommended ? "A OS-105 é antecipada para liberar João sem tocar nos horários das ordens diretamente afetadas." : "A OS-105 muda menos; a nova OS-106 absorve uma alteração de 30 minutos."}</p>
          </div>
          <div className="causal-panel">
            <p className="eyebrow">CADEIA CAUSAL</p>
            <ol>
              <li><strong>Carlos ficou indisponível</strong></li>
              <li>OS-106 perdeu um técnico</li>
              <li>João foi considerado</li>
              <li>OS-105 já ocupava João</li>
              <li><strong>OS-105 entrou na reorganização</strong></li>
            </ol>
          </div>
        </aside>
      </div>

      <button className="discarded-toggle" onClick={() => setShowDiscarded((value) => !value)} aria-expanded={showDiscarded}>
        <span><strong>Alternativas descartadas</strong><small>2 combinações inválidas, separadas dos planos aprováveis</small></span>
        <span>{showDiscarded ? "−" : "+"}</span>
      </button>
      {showDiscarded && (
        <div className="discarded-list">
          <article><strong>João → OS-104</strong><p>Certificação ausente: a OS exige NR10; João não possui NR10 nem skill elétrica.</p></article>
          <article><strong>Manter OS-105 e OS-106 às 15:30</strong><p>Sobreposição: João estaria em Perdizes e Vila Mariana no mesmo intervalo.</p></article>
        </div>
      )}

      <div className="approval-bar">
        <span><strong>{isRecommended ? "Plano recomendado" : "Plano conservador"}</strong><small>Será revalidado antes da aplicação</small></span>
        <button className="button primary approval" onClick={() => onApprove(plan)} disabled={busy}>{busy ? "Aplicando…" : "Aprovar e aplicar plano →"}</button>
      </div>
    </section>
  );
}

function Applied({ orders, plan, busy, onReset }: { orders: UiOrder[]; plan: PlanKind; busy: boolean; onReset: () => void }) {
  const conservative = plan === "conservative";
  return (
    <section className="applied-workspace" aria-labelledby="applied-title">
      <div className="success-banner">
        <span className="success-mark" aria-hidden="true">✓</span>
        <div><p className="eyebrow">REORGANIZAÇÃO APLICADA</p><h2 id="applied-title">Operação recuperada com 6 atendimentos preservados</h2><p>A agenda foi revalidada e atualizada por Despachante Demo.</p></div>
        <button className="button secondary" onClick={onReset} disabled={busy}>{busy ? "Restaurando…" : "Restaurar cenário"}</button>
      </div>
      <Agenda orders={orders} />
      <div className="after-grid">
        <div className="audit-panel">
          <div className="panel-heading"><h3>Registro de auditoria</h3><span>Agora · plano RP-001</span></div>
          <ul>
            <li><span>OS-102</span><strong>Carlos → João</strong><small>Equipe atualizada</small></li>
            <li><span>OS-104</span><strong>Carlos → Marina</strong><small>Equipe atualizada</small></li>
            <li><span>OS-105</span><strong>15:30 → {conservative ? "14:00" : "11:30"}</strong><small>Horário atualizado</small></li>
            <li><span>OS-106</span><strong>{conservative ? "15:30 → 16:00" : "Carlos → João"}</strong><small>{conservative ? "Horário e equipe atualizados" : "Equipe atualizada"}</small></li>
          </ul>
        </div>
        <div className="draft-panel">
          <div className="panel-heading"><h3>Rascunhos de comunicação</h3><span>Não enviados</span></div>
          <article><strong>Cliente · OS-105</strong><p>Olá! Seu atendimento foi mantido para 20/08, com nova janela às {conservative ? "14:00" : "11:30"}. Nenhuma ação é necessária neste momento.</p></article>
          <article><strong>Equipe técnica · João</strong><p>Rota atualizada: OS-102 às 09:00, OS-105 às 11:30 e OS-106 às 15:30. Confira veículo e recursos antes da saída.</p></article>
        </div>
      </div>
    </section>
  );
}

export function OneOpsWorkspace() {
  const [view, setView] = useState<View>("agenda");
  const [kind, setKind] = useState<InputKind>("request");
  const [text, setText] = useState("");
  const [orders, setOrders] = useState<UiOrder[]>(initialOrders);
  const [scenario, setScenario] = useState<ScenarioState | null>(null);
  const [notice, setNotice] = useState("Conectando à agenda persistida…");
  const [searching, setSearching] = useState(false);
  const [pendingAction, setPendingAction] = useState<ScenarioActionName | null>(null);
  const [appliedPlan, setAppliedPlan] = useState<PlanKind>("recommended");

  const hasNewOrder = useMemo(() => orders.some((order) => order.id === "OS-106"), [orders]);
  const isBusy = pendingAction !== null || searching;

  function hydrate(next: ScenarioState, nextNotice?: string) {
    setScenario(next);
    setOrders(toUiOrders(next));
    setAppliedPlan(planKindFromState(next));
    setView(viewForState(next));
    if (nextNotice) setNotice(nextNotice);
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/scenario", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível carregar a agenda persistida.");
        return response.json() as Promise<ScenarioState>;
      })
      .then((next) => hydrate(next, next.snapshot.orders.some(({ id }) => id === "OS-106")
        ? "Cenário persistido restaurado"
        : "Cenário demonstrativo carregado"))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setNotice(error instanceof Error ? error.message : "Falha ao carregar a agenda.");
      });
    return () => controller.abort();
  }, []);

  async function runAction(action: ScenarioActionName, nextNotice: string) {
    if (!scenario && action !== "RESET") {
      setNotice("Aguarde a agenda terminar de carregar.");
      return;
    }
    setPendingAction(action);
    try {
      const body = action === "RESET"
        ? { action, idempotencyKey: idempotencyKey(action) }
        : {
            action,
            expectedVersion: scenario?.version ?? 1,
            idempotencyKey: idempotencyKey(action),
          };
      const response = await fetch("/api/scenario/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as ScenarioActionResponse | {
        error?: { message?: string };
      };
      if (!response.ok || !("state" in payload)) {
        throw new Error("error" in payload && payload.error?.message
          ? payload.error.message
          : "A ação não pôde ser concluída.");
      }
      hydrate(payload.state, nextNotice);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "A ação não pôde ser concluída.");
    } finally {
      setPendingAction(null);
    }
  }

  function openIntake(nextKind: InputKind) {
    setKind(nextKind);
    setText("");
    setView("intake");
  }

  async function confirmReview() {
    if (kind === "request") {
      await runAction("CREATE_ORDER", "OS-106 criada, validada e persistida na agenda");
      return;
    }
    await startRecovery();
  }

  async function startRecovery() {
    if (!hasNewOrder) {
      setNotice("Registre a OS-106 antes de simular a indisponibilidade.");
      setView("agenda");
      return;
    }
    setSearching(true);
    try {
      await runAction("SIMULATE_CARLOS", "Impacto analisado pelo motor de recuperação");
    } finally {
      setSearching(false);
    }
  }

  async function applyPlan(plan: PlanKind) {
    await runAction(
      plan === "conservative" ? "APPLY_CONSERVATIVE" : "APPLY_RECOMMENDED",
      `${plan === "conservative" ? "Plano conservador" : "Plano recomendado"} aplicado com auditoria`,
    );
  }

  async function reset() {
    setText("");
    await runAction("RESET", "Cenário demonstrativo restaurado e persistido");
  }

  return (
    <main className="oneops-app">
      <header className="app-header">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">O</span>
          <div><strong>OneOps</strong><small>Recovery workspace</small></div>
        </div>
        <div className="demo-clock"><span aria-hidden="true">●</span><strong>Relógio de demonstração ativo</strong><small>19 ago 2026 · 10:00 BRT</small></div>
        <div className="header-context"><span>ClimaCerto Serviços</span><strong>Despachante Demo</strong></div>
      </header>

      <div className="app-content">
        {view === "agenda" && (
          <>
            <div className="command-bar">
              <div>
                <p className="eyebrow">OPERAÇÃO DO DIA</p>
                <h1>Quinta, 20 de agosto</h1>
                <p className="notice"><span aria-hidden="true">✓</span>{notice}</p>
              </div>
              <div className="command-actions">
                <button className="button secondary" onClick={() => openIntake("request")} disabled={!scenario || isBusy || hasNewOrder}>{hasNewOrder ? "✓ OS-106 registrada" : "+ Registrar pedido"}</button>
                <button className="button danger" onClick={() => openIntake("event")} disabled={!scenario || isBusy || !hasNewOrder}>! Informar imprevisto</button>
                <button className="button primary" onClick={startRecovery} disabled={!scenario || isBusy || !hasNewOrder}>{searching ? "Analisando impacto…" : "Simular indisponibilidade do Carlos"}</button>
                <button className="text-action reset-action" onClick={reset} disabled={!scenario || isBusy}>Restaurar cenário</button>
              </div>
            </div>
            <Agenda orders={orders} />
            <div className="ops-footer">
              <span><i className={`status-dot ${scenario ? "healthy" : "demo"}`} /> {scenario ? "Engine e D1 conectados" : "Conectando engine"}</span>
              <span><i className="status-dot healthy" /> 0 conflitos ativos</span>
              <span><i className="status-dot demo" /> Interpretação: modo demonstração</span>
              <span className="version">Agenda v{scenario?.version ?? 1}</span>
            </div>
          </>
        )}
        {view === "intake" && <Intake kind={kind} text={text} setText={setText} onBack={() => setView("agenda")} onInterpret={() => setView("review")} />}
        {view === "review" && <Review kind={kind} text={text} busy={isBusy} onBack={() => setView("intake")} onConfirm={confirmReview} />}
        {view === "recovery" && <Recovery scenario={scenario} busy={isBusy} onApprove={applyPlan} onBack={() => setView("agenda")} />}
        {view === "applied" && <Applied orders={orders} plan={appliedPlan} busy={isBusy} onReset={reset} />}
      </div>
    </main>
  );
}
