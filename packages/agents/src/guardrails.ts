// Os 12 guardrails de `docs/adr/0009-hardening-agentes.md` (seção 9.12.5 do prompt único) como
// PREDICADOS PUROS testáveis — "hook é bloqueio, regra em prompt é pedido" (mesma regra de ouro
// já aplicada a hooks de commit deste próprio repositório, agora aplicada ao runtime de agente).
// Cobre os guardrails com lógica verificável em código; os itens puramente organizacionais do
// ADR (ex. "uma instância por papel, container separado") não têm predicado aqui — são decisão
// de infraestrutura de deploy, fora do que este pacote pode verificar em runtime.
import type { AgentMessage } from "./model-provider";

/** Guardrail #1 (o mais importante para o portão de saída da Fase 10 — "injeção de prompt
 * bloqueada no corpus de teste"): uma instância que ingere QUALQUER mensagem não confiável
 * (`trusted: false`) na conversa nunca pode invocar uma ferramenta de escrita. Esta é a defesa
 * ESTRUTURAL contra injeção de prompt — não depende do modelo "se recusar sozinho" a obedecer
 * uma instrução maliciosa embutida na mensagem do hóspede/OTA/review.
 */
export class WriteToolBlockedByUntrustedContentError extends Error {
  constructor(toolName: string) {
    super(
      `Ferramenta de escrita "${toolName}" bloqueada — a conversa contém conteúdo não confiável ` +
        "(guardrail #1, docs/adr/0009-hardening-agentes.md). Nunca depende do modelo se recusar " +
        "sozinho; é uma checagem estrutural.",
    );
    this.name = "WriteToolBlockedByUntrustedContentError";
  }
}

export function assertNoWriteToolForUntrustedContent(
  messages: readonly AgentMessage[],
  requestedTool: string | null,
  writeToolNames: ReadonlySet<string>,
): void {
  if (!requestedTool || !writeToolNames.has(requestedTool)) {
    return;
  }
  const hasUntrustedContent = messages.some((m) => !m.trusted);
  if (hasUntrustedContent) {
    throw new WriteToolBlockedByUntrustedContentError(requestedTool);
  }
}

/** Guardrail #4: allowlist de staff para mensageria — nenhum ator fora da lista pode operar no
 * plano Operador (Hermes/Telegram/Slack/WhatsApp). */
export class ActorNotAllowlistedError extends Error {
  constructor(actorId: string) {
    super(`Ator "${actorId}" não está na allowlist de staff do plano Operador (guardrail #4).`);
    this.name = "ActorNotAllowlistedError";
  }
}

export function assertActorAllowlisted(actorId: string, allowlist: ReadonlySet<string>): void {
  if (!allowlist.has(actorId)) {
    throw new ActorNotAllowlistedError(actorId);
  }
}

/** Guardrail #7: orçamento por instância (tokens/CPU/memória/rate limit) — aqui só a parte de
 * tokens, que este pacote consegue medir sem depender de infraestrutura de deploy real. */
export class TokenBudgetExceededError extends Error {
  constructor(usedTokens: number, budgetTokens: number) {
    super(`Orçamento de tokens excedido: ${usedTokens} usados, limite de ${budgetTokens} (guardrail #7).`);
    this.name = "TokenBudgetExceededError";
  }
}

export function assertWithinTokenBudget(usedTokens: number, budgetTokens: number): void {
  if (usedTokens > budgetTokens) {
    throw new TokenBudgetExceededError(usedTokens, budgetTokens);
  }
}

/** Guardrail #10: nada irreversível sem confirmação humana explícita registrada. */
export class IrreversibleActionRequiresConfirmationError extends Error {
  constructor(actionName: string) {
    super(
      `Ação irreversível "${actionName}" exige confirmação humana explícita registrada ` +
        "(guardrail #10) — nunca executada só pela decisão do agente.",
    );
    this.name = "IrreversibleActionRequiresConfirmationError";
  }
}

export function assertNoIrreversibleWithoutConfirmation(
  actionName: string,
  isIrreversible: boolean,
  hasHumanConfirmation: boolean,
): void {
  if (isIrreversible && !hasHumanConfirmation) {
    throw new IrreversibleActionRequiresConfirmationError(actionName);
  }
}

/** Guardrail #11: fiscal/dinheiro — agente só enfileira/analisa/propõe, nunca emite/cancela nota
 * ou executa PIX. `financialExecutionToolNames` é a lista de ferramentas que EXECUTAM (não
 * propõem) uma consequência financeira/fiscal — nunca exposta a nenhum agente, plano nenhum. */
export class AgentCannotExecuteFinancialActionError extends Error {
  constructor(toolName: string) {
    super(
      `Agente não pode invocar "${toolName}" — execução financeira/fiscal direta é proibida para ` +
        "qualquer agente, em qualquer plano (guardrail #11). Só propor via approval_request.",
    );
    this.name = "AgentCannotExecuteFinancialActionError";
  }
}

export function assertNoFinancialExecution(
  toolName: string,
  financialExecutionToolNames: ReadonlySet<string>,
): void {
  if (financialExecutionToolNames.has(toolName)) {
    throw new AgentCannotExecuteFinancialActionError(toolName);
  }
}
