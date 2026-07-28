// titan-mcp-prod — catálogo restrito da seção 9.12.4 do prompt único, consumido só pelo Hermes no
// plano operador (docs/adr/0009-hardening-agentes.md / docs/adr/0010). NUNCA reusa/edita
// `server.ts` (titan-mcp-dev, Fase 0, catálogo de desenvolvimento) — o comentário no topo daquele
// arquivo já avisa isso; são processos e catálogos deliberadamente separados, nunca a mesma
// instância.
//
// As 6 ferramentas registradas abaixo são EXATAMENTE `EXPOSED_TOOL_CATALOG` de `@titan/agents`
// (READ_TOOLS + NARROW_WRITE_TOOLS) — nenhuma ferramenta de `BLOCKED_TOOLS` existe aqui, nem
// "desligada"/comentada (anti-padrão #20: invariante que só existe como texto). A checagem
// abaixo (`assertRegisteredToolsMatchCatalog`) falha ruidosamente no boot se os dois lugares
// divergirem, em vez de deixar a garantia só no CLAUDE.md.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  assertNoFinancialExecution,
  EXPOSED_TOOL_CATALOG,
  FINANCIAL_EXECUTION_TOOL_NAMES,
} from "@titan/agents";
import {
  createAgentApprovalRequest,
  getOccupancyReport,
  getPricingSuggestions,
  getReservationSummary,
  proposeRateChange,
} from "./prod-repo";

const REGISTERED_TOOL_NAMES = [
  "occupancy_report",
  "reservation_summary",
  "pricing_suggestions",
  "propose_rate_change",
  "draft_message",
  "create_approval_request",
] as const;

function assertRegisteredToolsMatchCatalog(): void {
  const catalogNames = new Set(EXPOSED_TOOL_CATALOG.map((tool) => tool.name));
  const registeredNames = new Set<string>(REGISTERED_TOOL_NAMES);
  const missingFromServer = [...catalogNames].filter((name) => !registeredNames.has(name));
  const extraInServer = [...registeredNames].filter((name) => !catalogNames.has(name));
  if (missingFromServer.length > 0 || extraInServer.length > 0) {
    throw new Error(
      "titan-mcp-prod: ferramentas registradas neste servidor divergem de " +
        `@titan/agents::EXPOSED_TOOL_CATALOG (faltando: [${missingFromServer.join(", ")}], ` +
        `sobrando: [${extraInServer.join(", ")}]).`,
    );
  }
}

assertRegisteredToolsMatchCatalog();

const server = new McpServer({
  name: "titan-mcp-prod",
  version: "0.1.0",
});

/** Mesmo princípio de nunca vazar stack trace cru para o consumidor da ferramenta — todo handler
 * abaixo captura erro e devolve texto claro com `isError: true`, nunca deixa a exceção estourar
 * sem tratamento pelo transporte stdio. */
function toolError(err: unknown): { content: [{ type: "text"; text: string }]; isError: true } {
  const message = err instanceof Error ? err.message : "Erro desconhecido ao executar a ferramenta.";
  return { content: [{ type: "text", text: message }], isError: true };
}

server.tool(
  "occupancy_report",
  "Ocupação agregada por unidade/período (reservas confirmed que se sobrepõem ao período) — agregação básica, não taxa de ocupação.",
  {
    tenantId: z.string().uuid(),
    periodStart: z.string(),
    periodEnd: z.string(),
  },
  async ({ tenantId, periodStart, periodEnd }) => {
    try {
      const rows = await getOccupancyReport(tenantId, { periodStart, periodEnd });
      return { content: [{ type: "text" as const, text: JSON.stringify(rows) }] };
    } catch (err) {
      return toolError(err);
    }
  },
);

server.tool(
  "reservation_summary",
  "Resumo de uma reserva com PII do hóspede mascarada (nome/documento/telefone não existem hoje no schema; identificador externo mascarado por precaução).",
  {
    tenantId: z.string().uuid(),
    reservationId: z.string().uuid(),
  },
  async ({ tenantId, reservationId }) => {
    try {
      const summary = await getReservationSummary(tenantId, reservationId);
      return { content: [{ type: "text" as const, text: JSON.stringify(summary) }] };
    } catch (err) {
      return toolError(err);
    }
  },
);

server.tool(
  "pricing_suggestions",
  "Sugestões/decisões de preço já registradas (pricing_snapshots, I8) para uma unidade — até as 10 datas mais recentes.",
  {
    tenantId: z.string().uuid(),
    unitId: z.string().uuid(),
  },
  async ({ tenantId, unitId }) => {
    try {
      const rows = await getPricingSuggestions(tenantId, unitId);
      return { content: [{ type: "text" as const, text: JSON.stringify(rows) }] };
    } catch (err) {
      return toolError(err);
    }
  },
);

server.tool(
  "propose_rate_change",
  "Propõe uma sugestão de preço — NUNCA publica sozinha; grava em pricing_snapshots (finalPriceCents = suggestedPriceCents, approvedBy sempre null), mesma tabela/fluxo do cockpit, nunca um caminho paralelo. suggestedPriceCents é sempre inteiro positivo (Zod) — dinheiro nunca é float, mesma regra dura do CLAUDE.md aplicada aqui.",
  {
    tenantId: z.string().uuid(),
    unitId: z.string().uuid(),
    date: z.string(),
    suggestedPriceCents: z.number().int().positive(),
  },
  async ({ tenantId, unitId, date, suggestedPriceCents }) => {
    try {
      // Guardrail #11 (docs/adr/0009-hardening-agentes.md): "propose_rate_change" nunca deveria
      // estar em FINANCIAL_EXECUTION_TOOL_NAMES — esta chamada confirma isso estruturalmente
      // antes de tocar o banco; se algum dia entrar por engano na lista bloqueada, lança aqui, em
      // vez de silenciosamente publicar preço como se fosse execução financeira.
      assertNoFinancialExecution("propose_rate_change", FINANCIAL_EXECUTION_TOOL_NAMES);
      const result = await proposeRateChange(tenantId, { unitId, date, suggestedPriceCents });
      return {
        content: [
          {
            type: "text" as const,
            text: `Proposta gravada em pricing_snapshots (id=${result.snapshotId}) — pendente de publicação humana via /pricing, nunca aplicada sozinha.`,
          },
        ],
      };
    } catch (err) {
      return toolError(err);
    }
  },
);

server.tool(
  "draft_message",
  "Rascunha uma mensagem ao hóspede — nunca envia sozinho; texto determinístico simples nesta fase (um LLM real substituiria isto), sempre pendente de revisão humana antes de qualquer envio. Não persiste em lugar nenhum.",
  {
    tenantId: z.string().uuid(),
    context: z.string(),
  },
  async ({ context }) => {
    try {
      // Redução de escopo documentada no briefing do Passo 4a: rascunho é só eco/template
      // determinístico, retornado como texto — revisão/envio real acontecem fora deste servidor,
      // nunca automaticamente.
      const draft =
        "[rascunho — revisão humana obrigatória antes de qualquer envio]\n" +
        `Contexto recebido: ${context}\n` +
        "Resposta sugerida: Olá! Recebemos sua mensagem e um de nossos atendentes vai responder em breve.";
      return { content: [{ type: "text" as const, text: draft }] };
    } catch (err) {
      return toolError(err);
    }
  },
);

server.tool(
  "create_approval_request",
  "Abre uma approval_request tipo 'agent_action' — único jeito de um agente pedir uma ação consequente, sempre via a fila de /aprovacoes já existente. Nunca aprova/executa nada sozinha.",
  {
    tenantId: z.string().uuid(),
    rationale: z.string(),
    risk: z.enum(["low", "medium", "high"]),
  },
  async ({ tenantId, rationale, risk }) => {
    try {
      const result = await createAgentApprovalRequest(tenantId, {
        rationale,
        // `impact` não é aceito como input externo desta ferramenta (só rationale/risk, ver
        // schema acima) — o servidor grava só a origem da proposta; o humano decide no cockpit
        // com o `rationale` como contexto, mesmo padrão de `price_out_of_band` (Fase 8).
        impact: { source: "titan-mcp-prod" },
        risk,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: `Solicitação de aprovação criada (id=${result.approvalRequestId}), status "pending" — aguardando decisão humana em /aprovacoes.`,
          },
        ],
      };
    } catch (err) {
      return toolError(err);
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[titan-mcp-prod] conectado via stdio");
}

main().catch((err) => {
  console.error("[titan-mcp-prod] falha ao iniciar:", err);
  process.exit(1);
});
