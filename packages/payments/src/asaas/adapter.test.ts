import { describe, expect, it, vi } from "vitest";
import { NotSupportedByGatewayError } from "../port";
import { createAsaasAdapter } from "./adapter";
import {
  ASAAS_WEBHOOK_TOKEN_FIXTURE,
  pixPaymentCreatedFixture,
  pixPaymentReceivedFixture,
  webhookPaymentReceivedFixture,
  webhookPaymentReceivedWithoutEventIdFixture,
  webhookPaymentRefundedFixture,
} from "./fixtures";

/**
 * Testes de contrato do adapter Asaas — sem credenciais reais, sem rede (nenhuma chamada foi
 * testada contra a API viva nesta sessão, ver TODO em adapter.ts). Estratégia: `fetchFn`
 * injetado (preferido a `vi.stubGlobal("fetch", ...)`, mais fácil de testar e mais parecido com
 * o zero-I/O-onde-der do resto do projeto), respondendo com as fixtures de `fixtures.ts`.
 */

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function buildAdapter(fetchFn: typeof fetch) {
  return createAsaasAdapter({
    apiUrl: "https://sandbox.asaas.com/api/v3",
    apiKey: "fixture-api-key-nao-e-segredo-real",
    webhookToken: ASAAS_WEBHOOK_TOKEN_FIXTURE,
    fetchFn,
  });
}

describe("AsaasAdapter — createIntent", () => {
  it("cria uma intenção PIX e retorna o shape esperado de GatewayIntent", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(pixPaymentCreatedFixture));
    const adapter = buildAdapter(fetchFn as unknown as typeof fetch);

    const intent = await adapter.createIntent({
      idempotencyKey: "idem-key-1",
      amountCents: 15000,
      currency: "BRL",
      reservationId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      method: "pix",
    });

    expect(intent).toEqual({
      externalId: pixPaymentCreatedFixture.id,
      status: "created",
      raw: pixPaymentCreatedFixture,
    });

    // Idempotência (I6): a chave de idempotência da chamada é enviada como header, não perdida.
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("idem-key-1");

    // Centavos->reais só na borda de saída para a API externa (I: dinheiro é inteiro em
    // centavos dentro da aplicação).
    const body = JSON.parse(init.body as string) as { value: number; billingType: string };
    expect(body.value).toBe(150);
    expect(body.billingType).toBe("PIX");
  });

  it("rejeita método diferente de pix (cartão é escopo do adapter Stripe)", async () => {
    const adapter = buildAdapter(vi.fn() as unknown as typeof fetch);
    await expect(
      adapter.createIntent({
        idempotencyKey: "idem-key-2",
        amountCents: 15000,
        currency: "BRL",
        reservationId: "res-1",
        method: "card",
      }),
    ).rejects.toThrow(/fora de escopo/);
  });

  it("mapeia status RECEIVED da API para 'captured'", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(pixPaymentReceivedFixture));
    const adapter = buildAdapter(fetchFn as unknown as typeof fetch);

    const intent = await adapter.createIntent({
      idempotencyKey: "idem-key-3",
      amountCents: 15000,
      currency: "BRL",
      reservationId: "res-1",
      method: "pix",
    });

    expect(intent.status).toBe("captured");
  });
});

describe("AsaasAdapter — capture", () => {
  it("lança NotSupportedByGatewayError — PIX não tem captura tardia", async () => {
    const adapter = buildAdapter(vi.fn() as unknown as typeof fetch);
    await expect(adapter.capture("pay_123")).rejects.toThrow(NotSupportedByGatewayError);
  });
});

describe("AsaasAdapter — refund", () => {
  it("chama o endpoint de estorno e retorna o novo status mapeado", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ ...pixPaymentReceivedFixture, status: "REFUNDED" }));
    const adapter = buildAdapter(fetchFn as unknown as typeof fetch);

    const intent = await adapter.refund({
      externalId: pixPaymentReceivedFixture.id,
      amountCents: 15000,
      reason: "Cancelamento a pedido do hóspede",
    });

    expect(intent.status).toBe("refunded");
    const [url] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(`/payments/${pixPaymentReceivedFixture.id}/refund`);
  });
});

describe("AsaasAdapter — verifyWebhookSignature", () => {
  it("aceita o token configurado", () => {
    const adapter = buildAdapter(vi.fn() as unknown as typeof fetch);
    expect(adapter.verifyWebhookSignature("{}", ASAAS_WEBHOOK_TOKEN_FIXTURE)).toBe(true);
  });

  it("rejeita um token inválido", () => {
    const adapter = buildAdapter(vi.fn() as unknown as typeof fetch);
    expect(adapter.verifyWebhookSignature("{}", "token-forjado-errado")).toBe(false);
  });

  it("rejeita token de tamanho diferente sem lançar", () => {
    const adapter = buildAdapter(vi.fn() as unknown as typeof fetch);
    expect(adapter.verifyWebhookSignature("{}", "curto")).toBe(false);
  });
});

describe("AsaasAdapter — parseWebhook", () => {
  it("extrai externalEventId/newStatus de um evento PAYMENT_RECEIVED", () => {
    const adapter = buildAdapter(vi.fn() as unknown as typeof fetch);
    const parsed = adapter.parseWebhook(JSON.stringify(webhookPaymentReceivedFixture));

    expect(parsed).toEqual({
      externalEventId: webhookPaymentReceivedFixture.id,
      externalIntentId: pixPaymentReceivedFixture.id,
      newStatus: "captured",
      raw: webhookPaymentReceivedFixture,
    });
  });

  it("extrai newStatus 'refunded' de um evento PAYMENT_REFUNDED", () => {
    const adapter = buildAdapter(vi.fn() as unknown as typeof fetch);
    const parsed = adapter.parseWebhook(JSON.stringify(webhookPaymentRefundedFixture));
    expect(parsed.newStatus).toBe("refunded");
  });

  it("compõe um externalEventId determinístico quando o payload não tem `id`", () => {
    const adapter = buildAdapter(vi.fn() as unknown as typeof fetch);
    const parsed = adapter.parseWebhook(JSON.stringify(webhookPaymentReceivedWithoutEventIdFixture));
    expect(parsed.externalEventId).toBe(`${pixPaymentReceivedFixture.id}:PAYMENT_RECEIVED`);
  });

  it("lança erro para evento sem mapeamento conhecido", () => {
    const adapter = buildAdapter(vi.fn() as unknown as typeof fetch);
    const payload = { id: "evt-x", event: "PAYMENT_CREATED", payment: pixPaymentCreatedFixture };
    expect(() => adapter.parseWebhook(JSON.stringify(payload))).toThrow(/não tem mapeamento/);
  });
});
