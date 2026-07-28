import { describe, expect, it, vi } from "vitest";
import { NoTaxRuleForDateError, type Cents, type IssuedInvoice, type TaxRule } from "@titan/domain";
import { civilDate } from "@titan/dates";
import type { FiscalGateway } from "@titan/fiscal";
import type { FiscalIssuanceJobPayload } from "../fiscal-queue";
import type { FiscalRepo, InsertFiscalDocumentInput, InsertFiscalDocumentResult } from "../fiscal-repo";
import { FiscalGatewayRejectionError, issueFiscalDocumentJob } from "./issue-fiscal-document";

/**
 * Testes de `issueFiscalDocumentJob` — sem Postgres/Redis reais (mesmo espírito de
 * `process-webhook.test.ts`/`process-channel-sync.test.ts`). O fake de `FiscalRepo` modela um
 * estado em memória por `naturalKey` (id + status) para poder provar a idempotência forte de
 * ponta a ponta: chamar o job duas vezes com o MESMO payload precisa resultar em `gateway.issue`
 * chamado exatamente 1 vez, porque a segunda chamada encontra a linha já `issued` (estado real
 * que o banco teria depois da primeira chamada bem-sucedida).
 */

function buildPayload(overrides: Partial<FiscalIssuanceJobPayload> = {}): FiscalIssuanceJobPayload {
  return {
    tenantId: "tenant-1",
    reservationId: "res-1",
    event: "payment_captured",
    referenceDateISO: "2026-07-28",
    municipalityCode: "3550308",
    serviceCode: "9.01",
    baseAmountCents: 20000 as Cents,
    currency: "BRL",
    takerDocument: "12345678909",
    description: "Hospedagem — reserva res-1",
    ...overrides,
  };
}

function buildTaxRule(overrides: Partial<TaxRule> = {}): TaxRule {
  return {
    id: "rule-1",
    tenantId: "tenant-1",
    municipalityCode: "3550308",
    serviceCode: "9.01",
    aliquotBasisPoints: 500, // 5%
    validFrom: civilDate("2026-01-01"),
    validTo: civilDate("2026-12-31"),
    ...overrides,
  };
}

interface FakeRow {
  id: string;
  status: string;
}

interface FakeRepoHandle {
  repo: FiscalRepo;
  rowsByNaturalKey: Map<string, FakeRow>;
  rejectedCalls: Array<{ id: string; reason: string }>;
  issuedCalls: Array<{ id: string; issued: IssuedInvoice }>;
}

let nextId = 0;

function buildFakeRepo(taxRule: TaxRule | (() => TaxRule)): FakeRepoHandle {
  const rowsByNaturalKey = new Map<string, FakeRow>();
  const rejectedCalls: Array<{ id: string; reason: string }> = [];
  const issuedCalls: Array<{ id: string; issued: IssuedInvoice }> = [];

  const repo: FiscalRepo = {
    findActiveTaxRule: vi.fn(async () => {
      if (typeof taxRule === "function") {
        return taxRule();
      }
      return taxRule;
    }),

    insertFiscalDocumentIfNew: vi.fn(async (_ctx, input: InsertFiscalDocumentInput): Promise<InsertFiscalDocumentResult> => {
      const existing = rowsByNaturalKey.get(input.naturalKey);
      if (existing) {
        return { kind: "already_exists", id: existing.id, status: existing.status };
      }
      const id = `doc-${++nextId}`;
      rowsByNaturalKey.set(input.naturalKey, { id, status: "pending" });
      return { kind: "created", id };
    }),

    updateFiscalDocumentIssued: vi.fn(async (_ctx, id, issued) => {
      issuedCalls.push({ id, issued });
      for (const row of rowsByNaturalKey.values()) {
        if (row.id === id) {
          row.status = "issued";
        }
      }
    }),

    updateFiscalDocumentRejected: vi.fn(async (_ctx, id, reason) => {
      rejectedCalls.push({ id, reason });
      for (const row of rowsByNaturalKey.values()) {
        if (row.id === id) {
          row.status = "rejected";
        }
      }
    }),

    markPendingFiscalDocumentRejectedByNaturalKey: vi.fn(async () => undefined),
  };

  return { repo, rowsByNaturalKey, rejectedCalls, issuedCalls };
}

function buildIssuedInvoice(overrides: Partial<IssuedInvoice> = {}): IssuedInvoice {
  return {
    externalInvoiceId: "ext-inv-1",
    naturalKey: "res-1:payment_captured:2026-07-28",
    issuedAtEpochMs: 1_753_660_800_000,
    raw: { ok: true },
    ...overrides,
  };
}

function buildLogger() {
  return { log: vi.fn(), error: vi.fn(), warn: vi.fn() };
}

describe("issueFiscalDocumentJob — idempotência forte", () => {
  it("chamar o job duas vezes com o mesmo payload (mesma natural_key) só chama o gateway 1 vez", async () => {
    const { repo, issuedCalls } = buildFakeRepo(buildTaxRule());
    const gateway: FiscalGateway = {
      issue: vi.fn(async () => buildIssuedInvoice()),
      cancel: vi.fn(),
      substitute: vi.fn(),
      query: vi.fn(),
      fetchPdf: vi.fn(),
      fetchXml: vi.fn(),
    };
    const logger = buildLogger();
    const payload = buildPayload();

    await issueFiscalDocumentJob(payload, { repo, gateway, logger });
    await issueFiscalDocumentJob(payload, { repo, gateway, logger });

    expect(gateway.issue).toHaveBeenCalledTimes(1);
    expect(issuedCalls).toHaveLength(1);
    expect(repo.insertFiscalDocumentIfNew).toHaveBeenCalledTimes(2);
  });

  it("uma linha ainda 'pending' (tentativa anterior interrompida) chama o gateway de novo, reusando a mesma linha", async () => {
    const { repo, rowsByNaturalKey, issuedCalls } = buildFakeRepo(buildTaxRule());
    const gateway: FiscalGateway = {
      issue: vi.fn(async () => buildIssuedInvoice()),
      cancel: vi.fn(),
      substitute: vi.fn(),
      query: vi.fn(),
      fetchPdf: vi.fn(),
      fetchXml: vi.fn(),
    };
    const payload = buildPayload();

    // Simula uma linha já criada por uma tentativa anterior que nunca chegou a chamar o gateway
    // (ex.: processo morreu entre o insert e a chamada de rede) — status ainda "pending".
    rowsByNaturalKey.set("res-1:payment_captured:2026-07-28", { id: "doc-preexisting", status: "pending" });

    await issueFiscalDocumentJob(payload, { repo, gateway, logger: buildLogger() });

    expect(gateway.issue).toHaveBeenCalledTimes(1);
    expect(issuedCalls).toEqual([{ id: "doc-preexisting", issued: expect.objectContaining({ externalInvoiceId: "ext-inv-1" }) }]);
  });
});

describe("issueFiscalDocumentJob — NoTaxRuleForDateError", () => {
  it("propaga o erro e nunca chega a criar o fiscal_document nem a chamar o gateway", async () => {
    const { repo } = buildFakeRepo(() => {
      throw new NoTaxRuleForDateError("3550308", "9.01", civilDate("2026-07-28"));
    });
    const gateway: FiscalGateway = {
      issue: vi.fn(),
      cancel: vi.fn(),
      substitute: vi.fn(),
      query: vi.fn(),
      fetchPdf: vi.fn(),
      fetchXml: vi.fn(),
    };

    await expect(issueFiscalDocumentJob(buildPayload(), { repo, gateway, logger: buildLogger() })).rejects.toThrow(
      NoTaxRuleForDateError,
    );

    expect(repo.insertFiscalDocumentIfNew).not.toHaveBeenCalled();
    expect(gateway.issue).not.toHaveBeenCalled();
  });
});

describe("issueFiscalDocumentJob — rejeição de negócio vs. falha de rede", () => {
  it("rejeição de negócio (FiscalGatewayRejectionError) marca rejected e NÃO relança", async () => {
    const { repo, rejectedCalls } = buildFakeRepo(buildTaxRule());
    const gateway: FiscalGateway = {
      issue: vi.fn(async () => {
        throw new FiscalGatewayRejectionError("CPF do tomador inválido");
      }),
      cancel: vi.fn(),
      substitute: vi.fn(),
      query: vi.fn(),
      fetchPdf: vi.fn(),
      fetchXml: vi.fn(),
    };

    await expect(issueFiscalDocumentJob(buildPayload(), { repo, gateway, logger: buildLogger() })).resolves.toBeUndefined();

    expect(rejectedCalls).toHaveLength(1);
    expect(rejectedCalls[0]!.reason).toContain("CPF do tomador inválido");
  });

  it("falha de rede/timeout relança para o BullMQ decidir retry, sem marcar rejected", async () => {
    const { repo, rejectedCalls } = buildFakeRepo(buildTaxRule());
    const gateway: FiscalGateway = {
      issue: vi.fn(async () => {
        throw new Error("timeout de rede ao chamar o provedor");
      }),
      cancel: vi.fn(),
      substitute: vi.fn(),
      query: vi.fn(),
      fetchPdf: vi.fn(),
      fetchXml: vi.fn(),
    };

    await expect(issueFiscalDocumentJob(buildPayload(), { repo, gateway, logger: buildLogger() })).rejects.toThrow(
      "timeout de rede ao chamar o provedor",
    );

    expect(rejectedCalls).toHaveLength(0);
  });
});
