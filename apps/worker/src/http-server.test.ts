import { describe, expect, it, vi } from "vitest";
import type { ParsedWebhookEvent, PaymentGatewayAdapter } from "@titan/payments";
import { handleWebhookRequest, type WebhookHandlerDeps } from "./http-server";

/**
 * Testes da lógica de tratamento de webhook (`handleWebhookRequest`) — sem `node:http` real, sem
 * rede: chama a função pura direto com objetos simples, injetando os três pontos de I/O
 * (resolver adapter, dedupe, enfileirar). Mesmo padrão de injeção de dependência do adapter Asaas
 * (packages/payments/src/asaas/adapter.test.ts).
 */

function fakeAdapter(overrides: Partial<PaymentGatewayAdapter> = {}): PaymentGatewayAdapter {
  return {
    gateway: "stripe",
    createIntent: vi.fn(),
    capture: vi.fn(),
    refund: vi.fn(),
    verifyWebhookSignature: vi.fn(() => true),
    parseWebhook: vi.fn(
      (): ParsedWebhookEvent => ({
        externalEventId: "evt_1",
        externalIntentId: "pi_1",
        newStatus: "captured",
        raw: {},
      }),
    ),
    ...overrides,
  };
}

function buildDeps(overrides: Partial<WebhookHandlerDeps> = {}): WebhookHandlerDeps {
  return {
    resolveAdapter: vi.fn(() => fakeAdapter()),
    insertWebhookEventIfNew: vi.fn(async () => true),
    enqueueWebhookJob: vi.fn(async () => undefined),
    logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
    ...overrides,
  };
}

describe("handleWebhookRequest — resolução de gateway", () => {
  it("responde 404 para gateway desconhecido/não configurado", async () => {
    const deps = buildDeps({ resolveAdapter: vi.fn(() => undefined) });
    const res = await handleWebhookRequest(
      { gatewayParam: "paypal", rawBody: "{}", headers: {} },
      deps,
    );
    expect(res.status).toBe(404);
    expect(deps.insertWebhookEventIfNew).not.toHaveBeenCalled();
    expect(deps.enqueueWebhookJob).not.toHaveBeenCalled();
  });
});

describe("handleWebhookRequest — verificação de assinatura (I6)", () => {
  it("responde 401 quando o header de assinatura está ausente", async () => {
    const deps = buildDeps();
    const res = await handleWebhookRequest(
      { gatewayParam: "stripe", rawBody: "{}", headers: {} },
      deps,
    );
    expect(res.status).toBe(401);
    expect(deps.enqueueWebhookJob).not.toHaveBeenCalled();
  });

  it("responde 401 e não processa quando a assinatura é inválida", async () => {
    const adapter = fakeAdapter({ verifyWebhookSignature: vi.fn(() => false) });
    const deps = buildDeps({ resolveAdapter: vi.fn(() => adapter) });
    const res = await handleWebhookRequest(
      { gatewayParam: "stripe", rawBody: "{}", headers: { "stripe-signature": "sig" } },
      deps,
    );
    expect(res.status).toBe(401);
    expect(adapter.parseWebhook).not.toHaveBeenCalled();
    expect(deps.insertWebhookEventIfNew).not.toHaveBeenCalled();
  });

  it("responde 401 quando verifyWebhookSignature lança (ex.: segredo ausente)", async () => {
    const adapter = fakeAdapter({
      verifyWebhookSignature: vi.fn(() => {
        throw new Error("STRIPE_WEBHOOK_SECRET ausente");
      }),
    });
    const deps = buildDeps({ resolveAdapter: vi.fn(() => adapter) });
    const res = await handleWebhookRequest(
      { gatewayParam: "stripe", rawBody: "{}", headers: { "stripe-signature": "sig" } },
      deps,
    );
    expect(res.status).toBe(401);
  });

  it("usa o nome de header certo por gateway (asaas-access-token para Asaas)", async () => {
    const adapter = fakeAdapter({ gateway: "asaas", verifyWebhookSignature: vi.fn(() => true) });
    const deps = buildDeps({ resolveAdapter: vi.fn(() => adapter) });
    const res = await handleWebhookRequest(
      { gatewayParam: "asaas", rawBody: "{}", headers: { "asaas-access-token": "token" } },
      deps,
    );
    expect(res.status).toBe(200);
    expect(adapter.verifyWebhookSignature).toHaveBeenCalledWith("{}", "token");
  });
});

describe("handleWebhookRequest — dedupe (I6)", () => {
  it("enfileira e responde 200 quando o evento é novo", async () => {
    const deps = buildDeps();
    const res = await handleWebhookRequest(
      { gatewayParam: "stripe", rawBody: "{}", headers: { "stripe-signature": "sig" } },
      deps,
    );
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    expect(deps.enqueueWebhookJob).toHaveBeenCalledWith({
      gateway: "stripe",
      externalEventId: "evt_1",
      externalIntentId: "pi_1",
      newStatus: "captured",
    });
  });

  it("responde 200 sem enfileirar quando o evento já foi processado", async () => {
    const deps = buildDeps({ insertWebhookEventIfNew: vi.fn(async () => false) });
    const res = await handleWebhookRequest(
      { gatewayParam: "stripe", rawBody: "{}", headers: { "stripe-signature": "sig" } },
      deps,
    );
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, deduped: true });
    expect(deps.enqueueWebhookJob).not.toHaveBeenCalled();
  });
});

describe("handleWebhookRequest — parseWebhook", () => {
  it("responde 400 quando o payload não pode ser parseado", async () => {
    const adapter = fakeAdapter({
      parseWebhook: vi.fn(() => {
        throw new Error("payload inesperado");
      }),
    });
    const deps = buildDeps({ resolveAdapter: vi.fn(() => adapter) });
    const res = await handleWebhookRequest(
      { gatewayParam: "stripe", rawBody: "{}", headers: { "stripe-signature": "sig" } },
      deps,
    );
    expect(res.status).toBe(400);
    expect(deps.insertWebhookEventIfNew).not.toHaveBeenCalled();
  });
});
