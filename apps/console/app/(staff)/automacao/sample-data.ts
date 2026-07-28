// Dados de amostra para o console de automação (Fase 10, Passo 4b — docs/fase-atual.md). NÃO há
// Postgres vivo nesta máquina (Docker Desktop parado — "Gap conhecido 2"), então esta rota não
// consulta packages/db para LER ainda — ./queries.ts já é real (mesmo padrão de
// apps/console/app/(staff)/pricing/sample-data.ts+queries.ts), trocar a fonte por lá é a única
// mudança necessária quando o Postgres estiver de pé.
//
// Determinístico de propósito (sem `Date.now()`/`Math.random()`) — mesmo espírito de
// apps/console/app/(staff)/aprovacoes/sample-data.ts — para que o preview renderize sempre igual.
// Shape de cada constante espelha o `$inferSelect` do schema Drizzle correspondente
// (packages/db/src/schema/agent-*.ts), exceto `SAMPLE_AGENT_ACTION_APPROVALS`, que usa o tipo de
// domínio `ApprovalRequest` (@titan/domain) — mesmo padrão de ../aprovacoes/sample-data.ts, para
// reusar exatamente o mesmo formato já consumido pela fila real. `costCents` usa o tipo `Cents`
// (branded `number` de @titan/domain, sempre inteiro em centavos) em vez de `number` cru — mesma
// convenção já usada em pricing/actions.ts, e que também evita o falso-positivo do hook
// `block-money-float.mjs` (heurística por nome de campo) sem brigar com o hook, mesmo espírito da
// renomeação `reconstructBalance` -> `reconstructStockLevel` da Fase 7 (docs/fase-atual.md).
import type { ApprovalRequest, Cents } from "@titan/domain";

const TENANT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a00"; // mesmo tenant de amostra de ../aprovacoes
const DAY_ANCHOR_EPOCH_MS = Date.parse("2026-07-28T00:00:00Z");
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

function at(hoursFromMidnight: number, minutesFromMidnight = 0): Date {
  return new Date(DAY_ANCHOR_EPOCH_MS + hoursFromMidnight * HOUR_MS + minutesFromMidnight * MINUTE_MS);
}

export interface SampleAgentConversation {
  id: string;
  tenantId: string;
  agentName: string;
  agentVersion: string;
  plane: "operator" | "platform";
  startedAt: Date;
  endedAt: Date | null;
}

// 4 conversas — 3 no plano 'platform' (Concierge, runtime próprio de packages/agents) e 1 no plano
// 'operator' (Hermes, staff via canal de mensageria — ADR-0010) para mostrar a distinção dos dois
// planos na UI, mesmo espírito do comentário em packages/db/src/schema/agent-conversation.ts.
export const SAMPLE_AGENT_CONVERSATIONS: readonly SampleAgentConversation[] = [
  {
    id: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b01",
    tenantId: TENANT_ID,
    agentName: "concierge",
    agentVersion: "v0.1",
    plane: "platform",
    startedAt: at(8, 12),
    endedAt: at(8, 15),
  },
  {
    id: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b02",
    tenantId: TENANT_ID,
    agentName: "concierge",
    agentVersion: "v0.1",
    plane: "platform",
    startedAt: at(10, 40),
    endedAt: null, // ainda em andamento
  },
  {
    id: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b03",
    tenantId: TENANT_ID,
    agentName: "concierge",
    agentVersion: "v0.1",
    plane: "platform",
    startedAt: at(13, 5),
    endedAt: at(13, 9),
  },
  {
    id: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b04",
    tenantId: TENANT_ID,
    agentName: "hermes",
    agentVersion: "v1.0",
    plane: "operator",
    startedAt: at(9, 0),
    endedAt: at(9, 3),
  },
] as const;

export interface SampleAgentTrace {
  id: string;
  tenantId: string;
  conversationId: string;
  role: "user" | "agent" | "tool";
  contentRedacted: string;
  toolName: string | null;
  tokenUsage: { promptTokens: number; completionTokens: number } | null;
  costCents: Cents;
  latencyMs: number;
  createdAt: Date;
}

// Traces das 4 conversas acima — pelo menos um com `toolName` preenchido (guardrail #1 do
// ADR-0009: instância que ingere conteúdo não confiável nunca tem ferramenta de escrita; o trace
// abaixo com `toolName: "check_wifi_password"` é só LEITURA, coerente com o guardrail).
// `contentRedacted` nunca guarda PII bruta — mesmo texto de amostra já reflete isso (sem nome de
// hóspede, sem telefone/e-mail real).
export const SAMPLE_AGENT_TRACES: readonly SampleAgentTrace[] = [
  {
    id: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c01",
    tenantId: TENANT_ID,
    conversationId: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b01",
    role: "user",
    contentRedacted: "[hóspede] Qual a senha do wifi?",
    toolName: null,
    tokenUsage: null,
    costCents: 0,
    latencyMs: 0,
    createdAt: at(8, 12),
  },
  {
    id: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c02",
    tenantId: TENANT_ID,
    conversationId: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b01",
    role: "tool",
    contentRedacted: "[ferramenta] consulta de senha de wifi da unidade — só leitura",
    toolName: "check_wifi_password",
    tokenUsage: null,
    costCents: 0,
    latencyMs: 45,
    createdAt: at(8, 13),
  },
  {
    id: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c03",
    tenantId: TENANT_ID,
    conversationId: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b01",
    role: "agent",
    contentRedacted: "[concierge] A senha do wifi é XXXXXXXX (rede \"Titan-Loft\").",
    toolName: null,
    tokenUsage: { promptTokens: 312, completionTokens: 28 },
    costCents: 4,
    latencyMs: 820,
    createdAt: at(8, 13),
  },
  {
    id: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c04",
    tenantId: TENANT_ID,
    conversationId: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b02",
    role: "user",
    contentRedacted: "[hóspede] Socorro, tem um vazamento no banheiro!",
    toolName: null,
    tokenUsage: null,
    costCents: 0,
    latencyMs: 0,
    createdAt: at(10, 40),
  },
  {
    id: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c05",
    tenantId: TENANT_ID,
    conversationId: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b02",
    role: "agent",
    contentRedacted:
      "[concierge] Entendido, é urgente — abrindo solicitação de aprovação para acionar o prestador de manutenção agora, encaminhando para confirmação humana (guardrail #10, ADR-0009).",
    toolName: "open_agent_action_approval",
    tokenUsage: { promptTokens: 540, completionTokens: 61 },
    costCents: 9,
    latencyMs: 1120,
    createdAt: at(10, 41),
  },
  {
    id: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c06",
    tenantId: TENANT_ID,
    conversationId: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b03",
    role: "user",
    contentRedacted: "[hóspede] Que horas é o checkout?",
    toolName: null,
    tokenUsage: null,
    costCents: 0,
    latencyMs: 0,
    createdAt: at(13, 5),
  },
  {
    id: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c07",
    tenantId: TENANT_ID,
    conversationId: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b03",
    role: "agent",
    contentRedacted: "[concierge] O checkout é até às 11h.",
    toolName: null,
    tokenUsage: { promptTokens: 198, completionTokens: 14 },
    costCents: 2,
    latencyMs: 410,
    createdAt: at(13, 6),
  },
  {
    id: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c08",
    tenantId: TENANT_ID,
    conversationId: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b04",
    role: "agent",
    contentRedacted: "[hermes] Repasse de julho revisado — nenhuma divergência encontrada na conciliação automática.",
    toolName: "review_payout_batch",
    tokenUsage: { promptTokens: 780, completionTokens: 95 },
    costCents: 14,
    latencyMs: 1560,
    createdAt: at(9, 1),
  },
] as const;

export interface SampleGoldenSetRun {
  id: string;
  tenantId: string;
  agentName: string;
  agentVersion: string;
  caseCount: number;
  accuracyBasisPoints: number;
  targetAccuracyBasisPoints: number;
  metTarget: boolean;
  createdAt: Date;
}

/** Coerente com o teste real de packages/agents/src/golden-set.test.ts: 20 casos, alvo de 90%
 * (9000 basis points) para o Concierge v0.1 (heurística de regras, `RuleBasedModelProvider`). */
export const SAMPLE_GOLDEN_SET_RUNS: readonly SampleGoldenSetRun[] = [
  {
    id: "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380d01",
    tenantId: TENANT_ID,
    agentName: "concierge",
    agentVersion: "v0.1",
    caseCount: 20,
    accuracyBasisPoints: 9000,
    targetAccuracyBasisPoints: 9000,
    metTarget: true,
    createdAt: at(6, 0),
  },
] as const;

export interface SampleAgentKillSwitch {
  id: string;
  tenantId: string;
  agentName: string;
  enabled: boolean;
  updatedAt: Date;
}

// 3 kill switches — pelo menos um `enabled: false` para mostrar os dois estados na UI. `hermes`
// desligado por amostra: coerente com o risco datado de docs/roadmap.md ("Vulnerabilidade em
// framework de agente... single-tenancy Hermes" — mitigação: "Hermes só no plano operador com
// allowlist"), nunca um dado inventado sem lastro no restante da documentação da fase.
export const SAMPLE_AGENT_KILL_SWITCHES: readonly SampleAgentKillSwitch[] = [
  {
    id: "e0eebc99-9c0b-4ef8-bb6d-6bb9bd380e01",
    tenantId: TENANT_ID,
    agentName: "concierge",
    enabled: true,
    updatedAt: at(7, 0),
  },
  {
    id: "e0eebc99-9c0b-4ef8-bb6d-6bb9bd380e02",
    tenantId: TENANT_ID,
    agentName: "pricing-scientist",
    enabled: true,
    updatedAt: at(7, 0),
  },
  {
    id: "e0eebc99-9c0b-4ef8-bb6d-6bb9bd380e03",
    tenantId: TENANT_ID,
    agentName: "hermes",
    enabled: false,
    updatedAt: at(11, 30),
  },
] as const;

const AGENT_ACTION_ANCHOR_EPOCH_MS = Date.parse("2026-07-28T09:00:00Z");

/** Mesmo formato exato de ../aprovacoes/sample-data.ts (`ApprovalRequest` de @titan/domain) —
 * reusa a fila real, nunca uma segunda implementação. `requestedBy` no formato do Agent Action
 * Badge (DESIGN.md §5), coerente com o trace de guardrail #10 registrado acima
 * (SAMPLE_AGENT_TRACES, conversa b...b02). */
export const SAMPLE_AGENT_ACTION_APPROVALS: readonly ApprovalRequest[] = [
  {
    id: "f0eebc99-9c0b-4ef8-bb6d-6bb9bd380f01",
    tenantId: TENANT_ID,
    type: "agent_action",
    requestedBy: "agent:concierge v0.1",
    rationale:
      "Hóspede reportou vazamento no banheiro (urgent_issue) — Concierge propõe acionar o prestador de " +
      "manutenção de plantão; execução requer confirmação humana (guardrail #10, ADR-0009), nunca disparada " +
      "sozinha pelo agente.",
    impact: { affectedEntities: ["reservation:r-4471", "conversation:b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b02"] },
    risk: "medium",
    requiredApprovals: 1,
    stepUpRequired: false,
    slaAtEpochMs: AGENT_ACTION_ANCHOR_EPOCH_MS + 2 * HOUR_MS,
    status: "pending",
  },
  {
    id: "f0eebc99-9c0b-4ef8-bb6d-6bb9bd380f02",
    tenantId: TENANT_ID,
    type: "agent_action",
    requestedBy: "agent:pricing-scientist v0.3",
    rationale:
      "Sugestão de preço para o fim de semana ficou fora da faixa de autonomia configurada — agente propõe " +
      "publicar o preço sugerido, aguardando decisão de titan.revenue (mesma fila de price_out_of_band, " +
      "reusada como agent_action porque a proposta partiu do agente, não de uma execução manual).",
    impact: { amountCents: 32000, affectedEntities: ["unit:a0000000-0000-4000-8000-000000000001"] },
    risk: "low",
    requiredApprovals: 1,
    stepUpRequired: false,
    slaAtEpochMs: AGENT_ACTION_ANCHOR_EPOCH_MS + 18 * HOUR_MS,
    status: "pending",
  },
] as const;
