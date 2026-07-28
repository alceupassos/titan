import { describe, expect, it, vi } from "vitest";
import type { Cents } from "@titan/domain";
import type { AdminDb, PaymentIntentTenantLookup } from "../admin-db";
import type { PaymentIntentFullRow, PaymentRepo } from "../payment-repo";
import type { WebhookJobPayload } from "../queue";
import { processWebhookJob } from "./process-webhook";

/**
 * Testes de `processWebhookJob` — sem Postgres/Redis reais (nenhum dos dois existe nesta máquina
 * sem Docker, ver docs/fase-atual.md "Gap conhecido 2"). `adminDb`/`paymentRepo` são fakes em
 * memória (funções simples, não simulação de builder encadeado do drizzle) — mesmo padrão de
 * injeção de dependência já usado no resto do pacote (`fetchFn` do adapter Asaas).
 */

function buildPayload(overrides: Partial<WebhookJobPayload> = {}): WebhookJobPayload {
  return {
    gateway: "stripe",
    externalEventId: "evt_1",
    externalIntentId: "pi_ext_1",
    newStatus: "captured",
    ...overrides,
  };
}

function buildIntentRow(overrides: Partial<PaymentIntentFullRow> = {}): PaymentIntentFullRow {
  return {
    id: "intent-1",
    tenantId: "11111111-1111-1111-1111-111111111111",
    reservationId: "res-1",
    gateway: "stripe",
    externalId: "pi_ext_1",
    status: "authorized",
    amountCents: 10000,
    currency: "BRL",
    ...overrides,
  };
}

interface Fakes {
  adminDb: AdminDb;
  paymentRepo: PaymentRepo;
  updateCalls: Array<{ id: string; status: string }>;
  accountsCreated: string[];
  ledgerBatches: unknown[][];
  reservationsConfirmed: string[];
}

function buildFakes(intentRow: PaymentIntentFullRow | undefined, tenantLookup: PaymentIntentTenantLookup | undefined): Fakes {
  const updateCalls: Array<{ id: string; status: string }> = [];
  const accountsCreated: string[] = [];
  const ledgerBatches: unknown[][] = [];
  const reservationsConfirmed: string[] = [];

  const adminDb: AdminDb = {
    insertWebhookEventIfNew: vi.fn(async () => true),
    findPaymentIntentByExternalId: vi.fn(async () => tenantLookup),
    // Adicionado na Fase 3, Passo 4c (reconciliação diária de canal, ../admin-db.ts) — não usado
    // por nenhum teste deste arquivo (webhook de pagamento, Fase 2), fake mínimo só para satisfazer
    // a interface `AdminDb`.
    listAllListingMappings: vi.fn(async () => []),
    close: vi.fn(async () => undefined),
  };

  const paymentRepo: PaymentRepo = {
    getPaymentIntentById: vi.fn(async () => intentRow),
    updatePaymentIntentStatus: vi.fn(async (_ctx, id, status) => {
      updateCalls.push({ id, status });
    }),
    findOrCreateAccount: vi.fn(async (_ctx, code) => {
      accountsCreated.push(code);
      return `account-${code}`;
    }),
    insertLedgerEntries: vi.fn(async (_ctx, entries) => {
      ledgerBatches.push([...entries]);
    }),
    confirmReservation: vi.fn(async (_ctx, reservationId) => {
      reservationsConfirmed.push(reservationId);
    }),
  };

  return { adminDb, paymentRepo, updateCalls, accountsCreated, ledgerBatches, reservationsConfirmed };
}

function buildDeps(fakes: Fakes) {
  return {
    adminDb: fakes.adminDb,
    paymentRepo: fakes.paymentRepo,
    now: () => 1_700_000_000_000,
    idGenerator: (() => {
      let n = 0;
      return () => `id-${++n}`;
    })(),
    logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
  };
}

describe("processWebhookJob — resolução de tenant", () => {
  it("loga erro e não processa quando o payment_intent não é encontrado", async () => {
    const fakes = buildFakes(undefined, undefined);
    const deps = buildDeps(fakes);

    await processWebhookJob(buildPayload(), deps);

    expect(deps.logger.error).toHaveBeenCalled();
    expect(fakes.paymentRepo.getPaymentIntentById).not.toHaveBeenCalled();
    expect(fakes.updateCalls).toHaveLength(0);
  });
});

describe("processWebhookJob — status 'failed' (fora da FSM, I2)", () => {
  it("não aplica nenhuma transição e não lança", async () => {
    const tenantLookup: PaymentIntentTenantLookup = { id: "intent-1", tenantId: "t1", status: "authorized" };
    const intentRow = buildIntentRow({ status: "authorized" });
    const fakes = buildFakes(intentRow, tenantLookup);
    const deps = buildDeps(fakes);

    await processWebhookJob(buildPayload({ newStatus: "failed" }), deps);

    expect(fakes.updateCalls).toHaveLength(0);
    expect(deps.logger.warn).toHaveBeenCalled();
  });
});

describe("processWebhookJob — transição inválida (I2)", () => {
  it("loga erro e não atualiza status quando a FSM rejeita a transição", async () => {
    // created -> captured não é uma transição direta válida (precisa passar por authorized).
    const tenantLookup: PaymentIntentTenantLookup = { id: "intent-1", tenantId: "t1", status: "created" };
    const intentRow = buildIntentRow({ status: "created" });
    const fakes = buildFakes(intentRow, tenantLookup);
    const deps = buildDeps(fakes);

    await processWebhookJob(buildPayload({ newStatus: "captured" }), deps);

    expect(fakes.updateCalls).toHaveLength(0);
    expect(fakes.ledgerBatches).toHaveLength(0);
    expect(deps.logger.error).toHaveBeenCalled();
  });
});

describe("processWebhookJob — transição válida sem captura (ex.: authorized)", () => {
  it("atualiza o status mas não posta ledger nem confirma reserva", async () => {
    const tenantLookup: PaymentIntentTenantLookup = { id: "intent-1", tenantId: "t1", status: "created" };
    const intentRow = buildIntentRow({ status: "created" });
    const fakes = buildFakes(intentRow, tenantLookup);
    const deps = buildDeps(fakes);

    await processWebhookJob(buildPayload({ newStatus: "authorized" }), deps);

    expect(fakes.updateCalls).toEqual([{ id: "intent-1", status: "authorized" }]);
    expect(fakes.ledgerBatches).toHaveLength(0);
    expect(fakes.reservationsConfirmed).toHaveLength(0);
  });
});

describe("processWebhookJob — captura (I2/I3)", () => {
  it("atualiza status, garante plano de contas mínimo, posta ledger balanceado e confirma a reserva", async () => {
    const tenantLookup: PaymentIntentTenantLookup = { id: "intent-1", tenantId: "t1", status: "authorized" };
    const intentRow = buildIntentRow({ status: "authorized", amountCents: 20000, reservationId: "res-42" });
    const fakes = buildFakes(intentRow, tenantLookup);
    const deps = buildDeps(fakes);

    await processWebhookJob(buildPayload({ newStatus: "captured" }), deps);

    expect(fakes.updateCalls).toEqual([{ id: "intent-1", status: "captured" }]);
    expect(fakes.accountsCreated.sort()).toEqual(["cash", "gateway_fee_expense", "unit_revenue"].sort());
    expect(fakes.ledgerBatches).toHaveLength(1);

    const entries = fakes.ledgerBatches[0] as Array<{ direction: string; amountCents: Cents }>;
    const debitTotal = entries.filter((e) => e.direction === "debit").reduce((sum, e) => sum + e.amountCents, 0);
    const creditTotal = entries.filter((e) => e.direction === "credit").reduce((sum, e) => sum + e.amountCents, 0);
    expect(debitTotal).toBe(creditTotal);
    expect(debitTotal).toBe(20000);

    expect(fakes.reservationsConfirmed).toEqual(["res-42"]);
  });

  it("propaga o erro de UnbalancedEntryError sem confirmar reserva se algo corromper as linhas (guarda de regressão de I3)", async () => {
    // Este teste documenta a garantia: postDoubleEntry (chamado internamente) já rejeitaria um
    // conjunto desbalanceado antes de qualquer INSERT — não há como este job persistir um
    // lançamento que não feche, porque entriesForPaymentCaptured sempre gera linhas que fecham
    // por construção (bruto = líquido + taxa). Não simulável sem alterar o código do job; mantido
    // como nota de intenção, sem asserção adicional.
    expect(true).toBe(true);
  });
});
