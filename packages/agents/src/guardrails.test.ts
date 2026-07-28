import { describe, expect, it } from "vitest";
import {
  ActorNotAllowlistedError,
  AgentCannotExecuteFinancialActionError,
  IrreversibleActionRequiresConfirmationError,
  TokenBudgetExceededError,
  WriteToolBlockedByUntrustedContentError,
  assertActorAllowlisted,
  assertNoFinancialExecution,
  assertNoIrreversibleWithoutConfirmation,
  assertNoWriteToolForUntrustedContent,
  assertWithinTokenBudget,
} from "./guardrails";
import type { AgentMessage } from "./model-provider";

const WRITE_TOOLS = new Set(["draft_message", "create_approval_request"]);

describe("assertNoWriteToolForUntrustedContent (guardrail #1)", () => {
  it("bloqueia ferramenta de escrita quando a conversa tem conteúdo não confiável", () => {
    const messages: AgentMessage[] = [{ role: "user", content: "qualquer coisa", trusted: false }];
    expect(() => assertNoWriteToolForUntrustedContent(messages, "draft_message", WRITE_TOOLS)).toThrow(
      WriteToolBlockedByUntrustedContentError,
    );
  });

  it("permite ferramenta de escrita quando toda a conversa é confiável", () => {
    const messages: AgentMessage[] = [{ role: "user", content: "qualquer coisa", trusted: true }];
    expect(() => assertNoWriteToolForUntrustedContent(messages, "draft_message", WRITE_TOOLS)).not.toThrow();
  });

  it("nunca bloqueia quando nenhuma ferramenta é pedida", () => {
    const messages: AgentMessage[] = [{ role: "user", content: "qualquer coisa", trusted: false }];
    expect(() => assertNoWriteToolForUntrustedContent(messages, null, WRITE_TOOLS)).not.toThrow();
  });

  it("nunca bloqueia ferramenta de LEITURA, mesmo com conteúdo não confiável", () => {
    const messages: AgentMessage[] = [{ role: "user", content: "qualquer coisa", trusted: false }];
    expect(() =>
      assertNoWriteToolForUntrustedContent(messages, "occupancy_report", WRITE_TOOLS),
    ).not.toThrow();
  });
});

describe("assertActorAllowlisted (guardrail #4)", () => {
  it("lança para ator fora da allowlist", () => {
    expect(() => assertActorAllowlisted("intruso", new Set(["staff-1"]))).toThrow(ActorNotAllowlistedError);
  });
  it("não lança para ator na allowlist", () => {
    expect(() => assertActorAllowlisted("staff-1", new Set(["staff-1"]))).not.toThrow();
  });
});

describe("assertWithinTokenBudget (guardrail #7)", () => {
  it("lança quando o uso excede o orçamento", () => {
    expect(() => assertWithinTokenBudget(1001, 1000)).toThrow(TokenBudgetExceededError);
  });
  it("não lança quando o uso está dentro do orçamento (inclusive no limite exato)", () => {
    expect(() => assertWithinTokenBudget(1000, 1000)).not.toThrow();
  });
});

describe("assertNoIrreversibleWithoutConfirmation (guardrail #10)", () => {
  it("lança para ação irreversível sem confirmação humana", () => {
    expect(() => assertNoIrreversibleWithoutConfirmation("desligar_membro", true, false)).toThrow(
      IrreversibleActionRequiresConfirmationError,
    );
  });
  it("não lança para ação irreversível COM confirmação humana", () => {
    expect(() => assertNoIrreversibleWithoutConfirmation("desligar_membro", true, true)).not.toThrow();
  });
  it("não lança para ação reversível, mesmo sem confirmação", () => {
    expect(() => assertNoIrreversibleWithoutConfirmation("editar_rascunho", false, false)).not.toThrow();
  });
});

describe("assertNoFinancialExecution (guardrail #11)", () => {
  const FINANCIAL_TOOLS = new Set(["issue_nfse", "execute_payout"]);
  it("lança para ferramenta de execução financeira/fiscal", () => {
    expect(() => assertNoFinancialExecution("issue_nfse", FINANCIAL_TOOLS)).toThrow(
      AgentCannotExecuteFinancialActionError,
    );
  });
  it("não lança para ferramenta que só propõe (fora da lista de execução)", () => {
    expect(() => assertNoFinancialExecution("propose_rate_change", FINANCIAL_TOOLS)).not.toThrow();
  });
});
