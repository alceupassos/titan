// Catálogo de ferramentas MCP (seção 9.12.4 do prompt único) — tabela versionada em forma de
// tipo, nunca código disperso (mesma regra dura já aplicada a alíquota/retenção/prazo de canal em
// todas as fases anteriores). 3 categorias: LEITURA (mascarada quando toca PII), ESCRITA ESTREITA
// e REVERSÍVEL com teto no servidor, e BLOQUEADA — ferramentas que não existem para NENHUM agente
// externo, listadas aqui só para o corpus de teste confirmar que nunca aparecem no catálogo
// exposto (nunca para implementá-las "desligadas").
export type McpToolCategory = "read" | "narrow_write" | "blocked";

export interface McpToolDefinition {
  readonly name: string;
  readonly category: McpToolCategory;
  readonly description: string;
}

export const READ_TOOLS: readonly McpToolDefinition[] = [
  { name: "occupancy_report", category: "read", description: "Ocupação agregada por unidade/período." },
  {
    name: "reservation_summary",
    category: "read",
    description: "Resumo de reserva com PII do hóspede mascarada (nome parcial, sem documento/telefone completo).",
  },
  { name: "pricing_suggestions", category: "read", description: "Sugestões de preço já publicadas (pricing_snapshots)." },
];

export const NARROW_WRITE_TOOLS: readonly McpToolDefinition[] = [
  {
    name: "propose_rate_change",
    category: "narrow_write",
    description: "Propõe uma sugestão de preço — nunca publica direto; sempre via pricing_snapshots + fluxo de aprovação existente.",
  },
  {
    name: "draft_message",
    category: "narrow_write",
    description: "Rascunha uma mensagem ao hóspede — nunca envia sozinho; fica pendente de revisão humana.",
  },
  {
    name: "create_approval_request",
    category: "narrow_write",
    description: "Abre uma approval_request tipo 'agent_action' — único jeito de um agente pedir uma ação consequente, sempre via a fila de /aprovacoes existente.",
  },
];

/** Nunca implementadas para NENHUM agente externo (Concierge, Hermes, ou qualquer futuro) — só
 * documentadas aqui para o teste confirmar ausência estrutural no catálogo exposto. */
export const BLOCKED_TOOLS: readonly McpToolDefinition[] = [
  { name: "issue_nfse", category: "blocked", description: "Emissão de nota fiscal — I7, execução financeira/fiscal direta." },
  { name: "cancel_nfse", category: "blocked", description: "Cancelamento de nota fiscal — I7." },
  { name: "execute_payout", category: "blocked", description: "Execução de repasse bancário — I2/I3." },
  { name: "process_refund", category: "blocked", description: "Execução de estorno — I2/I3." },
  { name: "charge_security_deposit", category: "blocked", description: "Cobrança de caução — consequência financeira direta." },
  { name: "change_user_role", category: "blocked", description: "Alteração de papel/permissão — I8-adjacent, escalonamento de privilégio." },
  { name: "export_pii_bulk", category: "blocked", description: "Exportação em massa de PII de hóspede." },
  { name: "cancel_reservation", category: "blocked", description: "Cancelamento de reserva sem confirmação humana." },
  { name: "delete_evidence", category: "blocked", description: "I10 — evidência nunca é excluída, nenhum papel, nenhum agente." },
  { name: "raw_sql", category: "blocked", description: "Query SQL irrestrita — mesmo achado F-4 já registrado em docs/adr/0017-mcps-instalados.md para MCP de terceiro." },
];

/** Catálogo real exposto a um agente externo (titan-mcp-prod) — só LEITURA e ESCRITA ESTREITA,
 * nunca as bloqueadas. `BLOCKED_TOOLS` nunca é concatenado aqui. */
export const EXPOSED_TOOL_CATALOG: readonly McpToolDefinition[] = [...READ_TOOLS, ...NARROW_WRITE_TOOLS];

export const WRITE_TOOL_NAMES: ReadonlySet<string> = new Set(NARROW_WRITE_TOOLS.map((t) => t.name));

/** Ferramentas que EXECUTAM (não propõem) consequência financeira/fiscal — guardrail #11. Usado
 * por `guardrails.ts::assertNoFinancialExecution`. */
export const FINANCIAL_EXECUTION_TOOL_NAMES: ReadonlySet<string> = new Set([
  "issue_nfse",
  "cancel_nfse",
  "execute_payout",
  "process_refund",
  "charge_security_deposit",
]);

export function isToolExposed(toolName: string): boolean {
  return EXPOSED_TOOL_CATALOG.some((tool) => tool.name === toolName);
}
