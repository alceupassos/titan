import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { StripeAdapter } from "./adapter";

/**
 * Testes de contrato do adapter Stripe — sem credenciais reais, sem rede.
 *
 * Estratégia: instancia um `Stripe` client de verdade com uma chave fake (nunca faz request
 * porque cada método de API é interceptado via `vi.spyOn`), e injeta esse client via
 * `stripeClient` (ver `StripeAdapterConfig`). Isso permite exercitar o mapeamento de status e a
 * montagem dos parâmetros de chamada sem depender da rede.
 *
 * Para o fluxo de webhook, usamos `Stripe.webhooks.generateTestHeaderString` — utilitário
 * oficial do SDK que gera uma assinatura HMAC válida offline, permitindo testar
 * `verifyWebhookSignature`/`parseWebhook` de verdade (sem mock) contra um payload de teste.
 */

const FAKE_API_KEY = "sk_test_fake_key_for_contract_tests_only";
const WEBHOOK_SECRET = "whsec_fake_secret_for_contract_tests_only";

function buildTestClient(): Stripe {
  return new Stripe(FAKE_API_KEY, { apiVersion: "2025-02-24.acacia" });
}

function buildAdapter(client: Stripe): StripeAdapter {
  return new StripeAdapter({ stripeClient: client, webhookSecret: WEBHOOK_SECRET });
}

function fakePaymentIntent(overrides: Partial<Stripe.PaymentIntent> = {}): Stripe.PaymentIntent {
  return {
    id: "pi_fake_123",
    object: "payment_intent",
    amount: 15000,
    currency: "usd",
    status: "requires_capture",
    metadata: {},
    ...overrides,
  } as Stripe.PaymentIntent;
}

describe("StripeAdapter.createIntent", () => {
  it("mapeia requires_capture -> authorized e propaga idempotencyKey/capture_method", async () => {
    const client = buildTestClient();
    const createSpy = vi
      .spyOn(client.paymentIntents, "create")
      .mockResolvedValue(fakePaymentIntent({ status: "requires_capture" }) as never);
    const adapter = buildAdapter(client);

    const result = await adapter.createIntent({
      idempotencyKey: "idem-key-1",
      amountCents: 15000,
      currency: "USD",
      reservationId: "res-1",
      method: "card",
    });

    expect(result.status).toBe("authorized");
    expect(result.externalId).toBe("pi_fake_123");
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 15000,
        currency: "usd",
        capture_method: "manual",
        metadata: { reservationId: "res-1" },
      }),
      expect.objectContaining({ idempotencyKey: "idem-key-1" }),
    );
  });

  it("mapeia succeeded -> captured", async () => {
    const client = buildTestClient();
    vi.spyOn(client.paymentIntents, "create").mockResolvedValue(fakePaymentIntent({ status: "succeeded" }) as never);
    const adapter = buildAdapter(client);

    const result = await adapter.createIntent({
      idempotencyKey: "idem-key-2",
      amountCents: 5000,
      currency: "BRL",
      reservationId: "res-2",
      method: "card",
    });

    expect(result.status).toBe("captured");
  });

  it("mapeia canceled -> failed", async () => {
    const client = buildTestClient();
    vi.spyOn(client.paymentIntents, "create").mockResolvedValue(fakePaymentIntent({ status: "canceled" }) as never);
    const adapter = buildAdapter(client);

    const result = await adapter.createIntent({
      idempotencyKey: "idem-key-3",
      amountCents: 5000,
      currency: "EUR",
      reservationId: "res-3",
      method: "card",
    });

    expect(result.status).toBe("failed");
  });

  it("rejeita método pix (fora de escopo deste adapter)", async () => {
    const client = buildTestClient();
    const adapter = buildAdapter(client);

    await expect(
      adapter.createIntent({
        idempotencyKey: "idem-key-4",
        amountCents: 5000,
        currency: "BRL",
        reservationId: "res-4",
        method: "pix",
      }),
    ).rejects.toThrow(/fora de escopo/);
  });
});

describe("StripeAdapter.capture", () => {
  it("mapeia succeeded -> captured ao capturar", async () => {
    const client = buildTestClient();
    vi.spyOn(client.paymentIntents, "capture").mockResolvedValue(fakePaymentIntent({ status: "succeeded" }) as never);
    const adapter = buildAdapter(client);

    const result = await adapter.capture("pi_fake_123");

    expect(result.status).toBe("captured");
  });
});

describe("StripeAdapter.refund", () => {
  it("envia o motivo em metadata.reason, nunca no campo reason nativo", async () => {
    const client = buildTestClient();
    const refundSpy = vi.spyOn(client.refunds, "create").mockResolvedValue({
      id: "re_fake_1",
      object: "refund",
      amount: 5000,
      payment_intent: "pi_fake_123",
    } as never);
    vi.spyOn(client.paymentIntents, "retrieve").mockResolvedValue(fakePaymentIntent({ status: "succeeded" }) as never);
    const adapter = buildAdapter(client);

    const result = await adapter.refund({
      externalId: "pi_fake_123",
      amountCents: 5000,
      reason: "hóspede cancelou dentro da janela de reembolso",
    });

    expect(refundSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent: "pi_fake_123",
        amount: 5000,
        metadata: { reason: "hóspede cancelou dentro da janela de reembolso" },
      }),
    );
    expect(refundSpy.mock.calls[0]?.[0]).not.toHaveProperty("reason");
    expect(result.status).toBe("captured");
  });
});

describe("StripeAdapter.verifyWebhookSignature / parseWebhook", () => {
  it("aceita assinatura válida gerada por Stripe.webhooks.generateTestHeaderString", () => {
    const client = buildTestClient();
    const adapter = buildAdapter(client);

    const payload = JSON.stringify({
      id: "evt_fake_1",
      type: "payment_intent.succeeded",
      data: { object: fakePaymentIntent({ status: "succeeded" }) },
    });
    const header = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: WEBHOOK_SECRET,
    });

    expect(adapter.verifyWebhookSignature(payload, header)).toBe(true);

    const parsed = adapter.parseWebhook(payload);
    expect(parsed.externalEventId).toBe("evt_fake_1");
    expect(parsed.externalIntentId).toBe("pi_fake_123");
    expect(parsed.newStatus).toBe("captured");
  });

  it("rejeita assinatura com segredo errado", () => {
    const client = buildTestClient();
    const adapter = buildAdapter(client);

    const payload = JSON.stringify({ id: "evt_fake_2", type: "payment_intent.succeeded" });
    const header = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: "whsec_outro_segredo_errado",
    });

    expect(adapter.verifyWebhookSignature(payload, header)).toBe(false);
  });

  it("rejeita payload alterado após a assinatura ter sido gerada", () => {
    const client = buildTestClient();
    const adapter = buildAdapter(client);

    const payload = JSON.stringify({ id: "evt_fake_3", type: "payment_intent.succeeded" });
    const header = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: WEBHOOK_SECRET,
    });

    const tamperedPayload = JSON.stringify({ id: "evt_fake_3", type: "payment_intent.succeeded", amount: 999999 });
    expect(adapter.verifyWebhookSignature(tamperedPayload, header)).toBe(false);
  });

  it("mapeia charge.refunded parcial -> partially_refunded", () => {
    const client = buildTestClient();
    const adapter = buildAdapter(client);

    const payload = JSON.stringify({
      id: "evt_fake_4",
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_fake_1",
          amount: 10000,
          amount_refunded: 4000,
          payment_intent: "pi_fake_999",
        },
      },
    });

    const parsed = adapter.parseWebhook(payload);
    expect(parsed.newStatus).toBe("partially_refunded");
    expect(parsed.externalIntentId).toBe("pi_fake_999");
  });

  it("lança erro para tipo de evento sem mapeamento", () => {
    const client = buildTestClient();
    const adapter = buildAdapter(client);

    const payload = JSON.stringify({ id: "evt_fake_5", type: "payment_intent.requires_action" });
    expect(() => adapter.parseWebhook(payload)).toThrow(/não tem mapeamento/);
  });
});
