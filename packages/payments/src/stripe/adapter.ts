import Stripe from "stripe";
import {
  NotSupportedByGatewayError,
  type CreateIntentParams,
  type Gateway,
  type GatewayIntent,
  type ParsedWebhookEvent,
  type PaymentGatewayAdapter,
  type RefundParams,
} from "../port";

/**
 * Configuração do adapter Stripe.
 *
 * `stripeClient` existe só para injeção em teste (contract test sem rede real, ver
 * `adapter.test.ts`) — em produção, deixe undefined e configure via env.
 */
export interface StripeAdapterConfig {
  readonly apiKey?: string;
  readonly webhookSecret?: string;
  readonly stripeClient?: Stripe;
}

/**
 * Mapeamento status do PaymentIntent do Stripe -> enum simplificado do port
 * (`GatewayIntent["status"]`).
 *
 * IMPORTANTE (seção 9.3 do prompt único: capacidades de gateway "a validar contra a
 * documentação vigente" — nomes de status abaixo conferidos contra a doc do Stripe consultada
 * nesta sessão, não contra uma chamada real de API; reconfirmar antes de produção):
 *
 *   - requires_payment_method -> created   (hóspede ainda não confirmou método de pagamento)
 *   - requires_confirmation   -> created   (client secret gerado, aguardando confirmação)
 *   - requires_action         -> created   (ex.: 3DS pendente — nenhum fundo retido ainda)
 *   - processing              -> created   (método assíncrono; TODO: revisar se deveria ser
 *                                            "authorized" para métodos que retêm fundo durante
 *                                            processing — não confirmado nesta sessão)
 *   - requires_capture        -> authorized (fundo retido, aguardando captura manual — I2)
 *   - succeeded               -> captured
 *   - canceled                -> failed
 *
 * Esta implementação SEMPRE cria o PaymentIntent com `capture_method: "manual"` (ver
 * `createIntent`) para que exista o estado intermediário `authorized` antes de `captured` —
 * captura automática (o padrão do Stripe) colapsaria authorized/captured num evento só e
 * quebraria a máquina de estados de I2/`packages/domain/src/payment/state-machine.ts`.
 */
function mapIntentStatus(status: Stripe.PaymentIntent.Status): GatewayIntent["status"] {
  switch (status) {
    case "requires_payment_method":
    case "requires_confirmation":
    case "requires_action":
    case "processing":
      return "created";
    case "requires_capture":
      return "authorized";
    case "succeeded":
      return "captured";
    case "canceled":
      return "failed";
    default:
      // Status futuro que a doc consultada nesta sessão não cobre — falha alto para não
      // classificar dinheiro de forma silenciosamente errada (I2).
      throw new Error(`StripeAdapter: status de PaymentIntent não mapeado: "${status satisfies never as string}"`);
  }
}

/**
 * Extrai o `payment_intent` de um objeto de evento do Stripe que o referencia por id
 * (Charge, Dispute) — o campo pode vir como string (id) ou como objeto expandido,
 * dependendo de como o webhook foi configurado no painel.
 */
function extractPaymentIntentId(value: string | Stripe.PaymentIntent | null | undefined): string {
  if (!value) {
    throw new Error("StripeAdapter: evento de webhook sem payment_intent associado.");
  }
  return typeof value === "string" ? value : value.id;
}

export class StripeAdapter implements PaymentGatewayAdapter {
  readonly gateway: Gateway = "stripe";

  private readonly client: Stripe;
  private readonly webhookSecret: string;

  constructor(config: StripeAdapterConfig = {}) {
    const apiKey = config.apiKey ?? process.env.STRIPE_SECRET_KEY;
    if (!config.stripeClient && !apiKey) {
      throw new Error(
        "StripeAdapter: STRIPE_SECRET_KEY ausente (env STRIPE_SECRET_KEY ou config.apiKey) e nenhum stripeClient injetado.",
      );
    }
    this.client =
      config.stripeClient ??
      new Stripe(apiKey as string, {
        // Fixar a versão de API explicitamente é a recomendação oficial do Stripe (evita
        // mudança silenciosa de shape de resposta). Versão usada é a única aceita pelos types
        // do SDK `stripe@17.7.0` instalado nesta sessão (`Stripe.LatestApiVersion`); TODO:
        // revalidar contra o painel real do Stripe (conta ainda não existe, ver
        // `docs/runbook-pagamentos.md`) antes de ir a produção.
        apiVersion: "2025-02-24.acacia",
      });
    this.webhookSecret = config.webhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET ?? "";
  }

  async createIntent(params: CreateIntentParams): Promise<GatewayIntent> {
    if (params.method !== "card") {
      // Este adapter cobre cartão internacional via Stripe Payment Intents/Elements (I4).
      // PIX/BRL é escopo do adapter Asaas (faixa paralela) — falhar explicitamente em vez de
      // fingir suporte não implementado, com o mesmo tipo de erro que o port já usa para
      // "operação de contrato comum que não existe de fato no gateway concreto".
      throw new NotSupportedByGatewayError(
        "stripe",
        `método de pagamento "${params.method}" fora de escopo desta implementação (só "card" é suportado). PIX é responsabilidade do adapter Asaas.`,
      );
    }

    const intent = await this.client.paymentIntents.create(
      {
        amount: params.amountCents,
        currency: params.currency.toLowerCase(),
        capture_method: "manual",
        metadata: { reservationId: params.reservationId },
        // Guest checkout funciona sem customer no Stripe (ao contrário do Asaas) — por isso
        // este campo do port é tratado como opcional aqui; quando o caller já resolveu um
        // Customer do Stripe, anexamos para reaproveitar métodos salvos/histórico do hóspede.
        ...(params.gatewayCustomerId ? { customer: params.gatewayCustomerId } : {}),
        // I4: nenhum dado de cartão (PAN/CVV) passa por este servidor. O `payment_method`
        // (um id já tokenizado por Stripe.js/Stripe Elements no navegador do hóspede) é
        // anexado do lado do cliente na confirmação do Payment Intent — nunca aqui.
      },
      // I6: idempotência nativa da API Stripe via header HTTP `Idempotency-Key`.
      { idempotencyKey: params.idempotencyKey },
    );

    return {
      externalId: intent.id,
      status: mapIntentStatus(intent.status),
      raw: intent,
    };
  }

  async capture(externalId: string): Promise<GatewayIntent> {
    const intent = await this.client.paymentIntents.capture(externalId);
    return {
      externalId: intent.id,
      status: mapIntentStatus(intent.status),
      raw: intent,
    };
  }

  async refund(params: RefundParams): Promise<GatewayIntent> {
    // A API do Stripe só aceita `reason` num enum fechado
    // ("duplicate" | "fraudulent" | "requested_by_customer") — o motivo de texto livre do
    // port não tem equivalente direto, então vai em `metadata.reason` (auditável, mas não no
    // campo nativo `reason`). TODO: revisar se a doc vigente abriu esse enum para texto livre.
    const refund = await this.client.refunds.create({
      payment_intent: params.externalId,
      amount: params.amountCents,
      metadata: { reason: params.reason },
    });

    const intent = await this.client.paymentIntents.retrieve(params.externalId);
    return {
      externalId: intent.id,
      status: mapIntentStatus(intent.status),
      raw: { refund, intent },
    };
  }

  verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean {
    if (!this.webhookSecret) {
      throw new Error(
        "StripeAdapter: STRIPE_WEBHOOK_SECRET ausente — não é seguro aceitar webhook sem segredo configurado (I6).",
      );
    }
    try {
      this.client.webhooks.constructEvent(rawBody, signatureHeader, this.webhookSecret);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * ATENÇÃO (I6): o shape do port (`parseWebhook(rawBody: string)`) não recebe o header de
   * assinatura — só `verifyWebhookSignature` recebe. Isso significa que este método NÃO
   * reverifica a assinatura sozinho; ele assume que o chamador já invocou
   * `verifyWebhookSignature(rawBody, signatureHeader)` e obteve `true` antes de chamar este
   * método. Nunca processar o resultado de `parseWebhook` sem essa checagem prévia ter
   * passado — do contrário um payload forjado (sem HMAC válido) seria interpretado como
   * evento real.
   */
  parseWebhook(rawBody: string): ParsedWebhookEvent {
    const event = JSON.parse(rawBody) as Stripe.Event;

    switch (event.type) {
      case "payment_intent.amount_capturable_updated": {
        const intent = event.data.object as Stripe.PaymentIntent;
        return {
          externalEventId: event.id,
          externalIntentId: intent.id,
          newStatus: "authorized",
          raw: event,
        };
      }
      case "payment_intent.succeeded": {
        const intent = event.data.object as Stripe.PaymentIntent;
        return {
          externalEventId: event.id,
          externalIntentId: intent.id,
          newStatus: "captured",
          raw: event,
        };
      }
      case "payment_intent.payment_failed":
      case "payment_intent.canceled": {
        const intent = event.data.object as Stripe.PaymentIntent;
        return {
          externalEventId: event.id,
          externalIntentId: intent.id,
          newStatus: "failed",
          raw: event,
        };
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const newStatus = charge.amount_refunded >= charge.amount ? "refunded" : "partially_refunded";
        return {
          externalEventId: event.id,
          externalIntentId: extractPaymentIntentId(charge.payment_intent),
          newStatus,
          raw: event,
        };
      }
      case "charge.dispute.closed": {
        // TODO (limitação real do port, não deste adapter): `ParsedWebhookEvent.newStatus`
        // não tem um estado "disputed" (só o terminal "charged_back"), então uma disputa
        // aberta (`charge.dispute.created`) não tem para onde ir aqui — só o fechamento com
        // perda é reportado. Isso é mais estreito que a máquina de estados de
        // `packages/domain/src/payment/state-machine.ts` (que tem `disputed` como estado
        // intermediário) e deveria ser revisitado quando o port ganhar esse estado.
        const dispute = event.data.object as Stripe.Dispute;
        if (dispute.status !== "lost") {
          throw new Error(
            `StripeAdapter: charge.dispute.closed com status "${dispute.status}" (não "lost") não tem mapeamento em ParsedWebhookEvent — só o caso de disputa perdida (charged_back) é suportado hoje.`,
          );
        }
        return {
          externalEventId: event.id,
          externalIntentId: extractPaymentIntentId(dispute.payment_intent),
          newStatus: "charged_back",
          raw: event,
        };
      }
      default:
        throw new Error(
          `StripeAdapter: tipo de evento de webhook "${event.type}" não tem mapeamento para ParsedWebhookEvent. Eventos não tratados: payment_intent.requires_action, payment_intent.created, charge.dispute.created (ver TODO acima), entre outros do catálogo do Stripe.`,
        );
    }
  }
}

export function createStripeAdapter(config?: StripeAdapterConfig): StripeAdapter {
  return new StripeAdapter(config);
}
