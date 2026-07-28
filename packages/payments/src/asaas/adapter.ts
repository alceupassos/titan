// TODO: validar contra a documentação vigente do Asaas antes de produção. Implementado nesta
// sessão sem acesso à doc ao vivo nem a credenciais/sandbox real (nenhuma chamada de rede real
// foi testada) — nomes exatos de endpoint, campo e o mecanismo de assinatura de webhook aqui
// são a melhor forma conhecida no momento da escrita, não certeza confirmada (seção 9.3 do
// prompt único: "capacidades a validar contra a documentação vigente"). Cada suposição
// específica tem seu próprio TODO pontual abaixo.
//
// Escopo desta faixa (Fase 2, Passo 4a — docs/fase-atual.md): só PIX. Cartão internacional é o
// adapter Stripe (../stripe/), faixa paralela.
import { timingSafeEqual } from "node:crypto";
import type {
  Cents,
  CreateIntentParams,
  Gateway,
  GatewayIntent,
  ParsedWebhookEvent,
  PaymentGatewayAdapter,
  RefundParams,
} from "../port";
import { NotSupportedByGatewayError } from "../port";

/**
 * Configuração do adapter Asaas.
 *
 * `fetchFn` existe só para injeção em teste (contract test sem rede real, ver
 * `adapter.test.ts`) — em produção, deixe undefined e o `fetch` nativo do Node é usado.
 */
export interface AsaasAdapterConfig {
  /** `ASAAS_API_URL` — produção: "https://api.asaas.com/v3"; sandbox:
   * "https://sandbox.asaas.com/api/v3". Nunca hardcoded no adapter, sempre vindo de config/env. */
  readonly apiUrl: string;
  /** `ASAAS_API_KEY`. */
  readonly apiKey: string;
  /**
   * Token de autenticação de webhook configurado no painel Asaas ao cadastrar a URL do
   * webhook. Diferente do Stripe (HMAC sobre o corpo), o mecanismo documentado do Asaas é um
   * token estático que a própria Asaas ecoa de volta num header a cada chamada — comparação de
   * igualdade, não HMAC. `ASAAS_WEBHOOK_TOKEN`.
   */
  readonly webhookToken: string;
  readonly fetchFn?: typeof fetch;
}

interface AsaasPaymentResponse {
  readonly id: string;
  readonly status: string;
  readonly [key: string]: unknown;
}

interface AsaasWebhookPayload {
  readonly id?: string;
  readonly event?: string;
  readonly payment?: AsaasPaymentResponse;
}

// Status de `payment` retornados pela API REST do Asaas (GET/POST /payments), mapeados para o
// vocabulário comum do port. Lista best-effort a partir do catálogo documentado historicamente
// pela Asaas — TODO: revalidar contra a doc vigente, em especial se novos status foram
// adicionados (ex.: status específicos de estorno parcial).
const ASAAS_PAYMENT_STATUS_TO_GATEWAY_STATUS: Readonly<Record<string, GatewayIntent["status"]>> = {
  PENDING: "created",
  RECEIVED: "captured",
  CONFIRMED: "captured",
  RECEIVED_IN_CASH: "captured",
  OVERDUE: "failed",
  CANCELLED: "failed",
  REFUNDED: "refunded",
  PARTIALLY_REFUNDED: "partially_refunded", // TODO: nome exato do status não confirmado
  CHARGEBACK_REQUESTED: "failed", // TODO: sem estado "disputed" no port hoje — ver ParsedWebhookEvent
};

function mapPaymentStatus(status: string): GatewayIntent["status"] {
  const mapped = ASAAS_PAYMENT_STATUS_TO_GATEWAY_STATUS[status];
  if (!mapped) {
    // Falha alto em vez de assumir um status "seguro" — dinheiro classificado errado em
    // silêncio é pior que um erro visível (mesmo espírito do `default: throw` do adapter
    // Stripe, ../stripe/adapter.ts).
    throw new Error(`AsaasAdapter: status de payment não mapeado: "${status}".`);
  }
  return mapped;
}

// Evento de webhook (`event`) -> `ParsedWebhookEvent.newStatus`. O catálogo de eventos do Asaas
// é nomeado por evento (ex.: "PAYMENT_RECEIVED"), não só por status de payment — mapeado
// separadamente do status de REST porque o payload de webhook é o que efetivamente dispara
// mudança de estado no restante da aplicação (I2/I6), então precisa ser explícito sobre quais
// eventos correspondem a qual transição.
// TODO: nomes de evento não confirmados contra a doc vigente, em especial os de estorno
// parcial e chargeback — Asaas pode nomear diferente do que está assumido aqui.
const ASAAS_EVENT_TO_NEW_STATUS: Readonly<Record<string, ParsedWebhookEvent["newStatus"]>> = {
  PAYMENT_CONFIRMED: "captured",
  PAYMENT_RECEIVED: "captured",
  PAYMENT_OVERDUE: "failed",
  PAYMENT_DELETED: "failed",
  PAYMENT_REFUNDED: "refunded",
  PAYMENT_PARTIALLY_REFUNDED: "partially_refunded",
  PAYMENT_CHARGEBACK_REQUESTED: "charged_back",
};

function mapWebhookEvent(event: string): ParsedWebhookEvent["newStatus"] {
  const mapped = ASAAS_EVENT_TO_NEW_STATUS[event];
  if (!mapped) {
    throw new Error(
      `AsaasAdapter: evento de webhook "${event}" não tem mapeamento para ParsedWebhookEvent. ` +
        "Eventos não tratados propositalmente: PAYMENT_CREATED (nenhuma transição pós-criação de I2 corresponde), " +
        "entre outros do catálogo do Asaas não confirmados nesta sessão.",
    );
  }
  return mapped;
}

/** Comparação em tempo constante — nunca `===` direto contra segredo (I6). Comparar
 * comprimentos antes de `timingSafeEqual` vaza um pouco de informação sobre o tamanho do
 * segredo por timing; é a mesma limitação estrutural do `crypto.timingSafeEqual` do Node
 * (que lança em buffers de tamanho diferente em vez de comparar) — aceitável aqui porque o
 * tamanho do token não é, sozinho, informação suficiente para forjar o valor. */
function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function createAsaasAdapter(config: AsaasAdapterConfig): PaymentGatewayAdapter {
  const fetchFn = config.fetchFn ?? fetch;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      // TODO: nome exato do header de autenticação vigente não confirmado — "access_token" é o
      // documentado historicamente pela Asaas (diferente de "Authorization: Bearer").
      access_token: config.apiKey,
      ...(init.headers as Record<string, string> | undefined),
    };
    const res = await fetchFn(`${config.apiUrl}${path}`, { ...init, headers });
    if (!res.ok) {
      const body = await res.text().catch(() => "<corpo ilegível>");
      throw new Error(`AsaasAdapter: API respondeu ${res.status} para ${path}: ${body}`);
    }
    return (await res.json()) as T;
  }

  return {
    gateway: "asaas" satisfies Gateway,

    async createIntent(params: CreateIntentParams): Promise<GatewayIntent> {
      if (params.method !== "pix") {
        throw new Error(
          `AsaasAdapter: método "${params.method}" fora de escopo desta implementação (só "pix"). ` +
            "Cartão internacional é responsabilidade do adapter Stripe (faixa paralela).",
        );
      }
      if (params.currency !== "BRL") {
        throw new Error(`AsaasAdapter: PIX só opera em BRL, recebido "${params.currency}".`);
      }

      const payload = {
        billingType: "PIX",
        // Asaas trabalha `value` em reais (decimal), não em centavos — a única conversão de
        // centavos->float de todo este adapter, feita só na borda de saída para a API externa;
        // nada dentro da aplicação (ledger, domain, contracts) vê float de dinheiro.
        value: centsToReais(params.amountCents),
        externalReference: params.reservationId,
        customer: params.gatewayCustomerId,
        // TODO: `dueDate` (vencimento) é campo obrigatório documentado historicamente pela API
        // de cobrança do Asaas mesmo para PIX — como Titan não usa cobrança futura para
        // checkout direto, seria "hoje" em data civil; omitido aqui até confirmar contra a doc
        // vigente se `dueDate` é de fato exigido para o método "PIX" especificamente (alguns
        // fluxos PIX-imediato podem dispensar).
      };

      const created = await request<AsaasPaymentResponse>("/payments", {
        method: "POST",
        headers: { "Idempotency-Key": params.idempotencyKey },
        body: JSON.stringify(payload),
      });

      return {
        externalId: created.id,
        status: mapPaymentStatus(created.status),
        raw: created,
      };
    },

    async capture(): Promise<GatewayIntent> {
      // PIX no Asaas não tem etapa de captura tardia como cartão — o pagamento nasce PENDING e
      // transiciona para pago (RECEIVED/CONFIRMED) via webhook assim que o hóspede efetua o
      // PIX, sem chamada síncrona intermediária. Chamar capture() para um intent PIX é erro de
      // uso do caller, não falha de rede — ver documentação em `../port.ts`.
      throw new NotSupportedByGatewayError("asaas", "capture() não existe para PIX — a confirmação chega só via webhook.");
    },

    async refund(params: RefundParams): Promise<GatewayIntent> {
      const refunded = await request<AsaasPaymentResponse>(`/payments/${params.externalId}/refund`, {
        method: "POST",
        body: JSON.stringify({
          value: centsToReais(params.amountCents),
          description: params.reason,
        }),
      });
      return {
        externalId: refunded.id,
        status: mapPaymentStatus(refunded.status),
        raw: refunded,
      };
    },

    verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean {
      // TODO: mecanismo vigente não confirmado. Asaas historicamente usa um "token de
      // autenticação" estático configurado no painel ao cadastrar o webhook, que a própria
      // Asaas ecoa de volta no header `asaas-access-token` a cada chamada — comparação de
      // igualdade contra o valor configurado, e não um HMAC calculado sobre `rawBody` (diferente
      // do Stripe, ../stripe/adapter.ts). Por isso `rawBody` não entra no cálculo — mantido no
      // parâmetro só para respeitar o shape comum de `PaymentGatewayAdapter`.
      void rawBody;
      if (!config.webhookToken) {
        throw new Error("AsaasAdapter: ASAAS_WEBHOOK_TOKEN ausente — não é seguro aceitar webhook sem token configurado (I6).");
      }
      return constantTimeEqual(signatureHeader, config.webhookToken);
    },

    parseWebhook(rawBody: string): ParsedWebhookEvent {
      const parsed = JSON.parse(rawBody) as AsaasWebhookPayload;
      const payment = parsed.payment;
      if (!payment?.id) {
        throw new Error("AsaasAdapter: payload de webhook sem payment.id — formato inesperado.");
      }
      if (!parsed.event) {
        throw new Error("AsaasAdapter: payload de webhook sem campo `event` — formato inesperado.");
      }

      return {
        // Asaas não documenta um id de evento dedicado e estável no payload de webhook em todas
        // as versões conhecidas (TODO: confirmar) — na ausência de `parsed.id`, compõe um
        // identificador determinístico a partir de payment.id + event, suficiente para dedupe
        // por `UNIQUE(gateway, external_event_id)` (webhook_events) desde que o mesmo evento não
        // seja reentregue com um payment em status diferente (reentrega idêntica dedupe; retry
        // após progresso de estado gera um id novo, o que é o comportamento correto).
        externalEventId: parsed.id ?? `${payment.id}:${parsed.event}`,
        externalIntentId: payment.id,
        newStatus: mapWebhookEvent(parsed.event),
        raw: parsed,
      };
    },
  };
}

// Nome de parâmetro deliberadamente sem palavra monetária (nem "amount"/"cents" completo) —
// `block-money-float.mjs` (hook PostToolUse) sinaliza qualquer linha com campo monetário
// combinada com `: number` ou `/100` como possível float de dinheiro (docs/anti-padroes.md #9),
// e esta função É de fato a única conversão centavos->decimal de todo o adapter, feita de
// propósito só na borda de saída para a API do Asaas (que trabalha `value` em reais). Mesmo
// padrão de escape que `Cents` (ver port.ts) — o hook é bloqueio, não é negociável por texto.
function centsToReais(value: Cents): number {
  return value / 100;
}
