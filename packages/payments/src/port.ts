// Porta comum de gateway de pagamento (Fase 2, Passo 4a — docs/fase-atual.md). Cada adapter
// concreto (`asaas/`, `stripe/`, faixas paralelas diferentes) implementa `PaymentGatewayAdapter`
// sem que o resto da aplicação (checkout, worker de webhook, ledger) precise saber qual gateway
// está por trás — mesmo espírito de "adapters, não `if canal === 'x'` espalhado" do anti-padrão
// #5 do prompt único, aplicado a pagamento em vez de canal de distribuição.
//
// I4 — nenhum dado de cartão (PAN/CVV) trafega ou repousa na aplicação: nenhum campo aqui
// carrega número de cartão; pagamento por cartão usa hosted fields/tokenização do próprio
// gateway no navegador (ver `packages/contracts/src/checkout.ts`). `raw` abaixo é o payload cru
// do gateway só para depuração — nunca logar `raw` sem antes confirmar que não carrega PAN.
//
// I6 — toda chamada de/para webhook é idempotente e com assinatura verificada:
// `idempotencyKey` é único por intenção de criação (âncora: `payment_intents.idempotency_key`
// UNIQUE, packages/db/migrations/0003_ledger_approvals_payments.sql); `verifyWebhookSignature`/
// `parseWebhook` são puramente de leitura/validação — o dedupe por `event_id` em si
// (`webhook_events` UNIQUE(gateway, external_event_id)) é responsabilidade de quem CONSOME o
// webhook (apps/worker, faixa futura), não deste adapter.
//
// Camada 0 (docs/adr/0005-orquestracao-de-pagamentos.md / docs/runbook-pagamentos.md): a
// plataforma nunca inicia saque do gateway para conta bancária — por isso esta interface
// deliberadamente NÃO tem nenhum método de payout/transferência/saque, mesmo que a API de um
// gateway ofereça um endpoint para isso. Não adicione um.

export type Gateway = "asaas" | "stripe"; // mesmo shape de @titan/contracts GatewaySchema

// Alias em vez de `number` cru pelo mesmo motivo de `packages/domain/src/ledger/ledger-entry.ts`:
// `docs/anti-padroes.md` #9 e o hook `block-money-float.mjs` tratam qualquer campo monetário
// tipado como `number` puro como suspeito de float — o nome do tipo torna explícito que já é
// inteiro em centavos (Dinero.js/`@titan/money` fica na borda de apresentação, não aqui).
export type Cents = number;

export interface CreateIntentParams {
  readonly idempotencyKey: string; // único por intenção — I6
  readonly amountCents: Cents;
  readonly currency: "BRL" | "USD" | "EUR"; // mesmo CurrencyCode de @titan/money
  readonly reservationId: string;
  readonly method: "pix" | "card";
  // Adicionado nesta faixa (Asaas), não estava no shape original do plano: todo Payment no
  // Asaas pertence a um Customer pré-cadastrado (não existe "guest checkout" anônimo na API
  // deles). Este pacote não recebe dados de hóspede (nome/e-mail/CPF) — isso vive em
  // `packages/contracts/src/checkout.ts` / `apps/web`, faixa paralela. Campo opcional para o
  // caller já resolver/persistir o customer do gateway antes de criar a intenção; quando
  // ausente, o adapter Asaas usa `reservationId` como referência externa mínima (ver TODO em
  // `asaas/adapter.ts`). Adapters que não precisam disso (Stripe, que aceita guest checkout via
  // PaymentIntent direto) simplesmente ignoram o campo.
  readonly gatewayCustomerId?: string;
}

export interface GatewayIntent {
  readonly externalId: string;
  // Ajustado nesta faixa: o shape original do plano tinha só
  // "created" | "authorized" | "captured" | "failed". `refund()` devolve um GatewayIntent e
  // precisa conseguir representar o resultado de um estorno — adicionados "refunded" e
  // "partially_refunded" (mesmo vocabulário de `ParsedWebhookEvent.newStatus` abaixo e de
  // `packages/domain/src/payment/state-machine.ts`, I2) para não forçar o adapter a mentir o
  // status num desses dois campos.
  readonly status: "created" | "authorized" | "captured" | "failed" | "refunded" | "partially_refunded";
  readonly raw: unknown; // payload cru do gateway, para depuração — NUNCA logar isto se puder conter PAN
}

export interface RefundParams {
  readonly externalId: string;
  readonly amountCents: Cents;
  readonly reason: string;
}

export interface ParsedWebhookEvent {
  readonly externalEventId: string;
  readonly externalIntentId: string;
  readonly newStatus: "authorized" | "captured" | "failed" | "refunded" | "partially_refunded" | "charged_back";
  readonly raw: unknown;
}

export interface PaymentGatewayAdapter {
  readonly gateway: Gateway;
  createIntent(params: CreateIntentParams): Promise<GatewayIntent>;
  // Ajustado nesta faixa: PIX no Asaas (e, de modo geral, PIX em qualquer gateway brasileiro)
  // não tem uma etapa de "captura tardia" separada de autorização como cartão — o pagamento é
  // criado e transiciona para pago/confirmado via webhook assim que o PIX é liquidado, sem
  // chamada síncrona intermediária. Adapters PIX-only (como o Asaas nesta fase) implementam
  // `capture()` lançando `NotSupportedByGatewayError` em vez de fingir suporte; adapters de
  // cartão (Stripe, outra faixa) implementam de verdade. Mantido no contrato comum porque
  // `PaymentGatewayAdapter` precisa ser um shape único consumido de forma polimórfica pelo
  // roteador de pagamento — o caller que só lida com PIX simplesmente nunca chama `capture()`.
  capture(externalId: string): Promise<GatewayIntent>;
  refund(params: RefundParams): Promise<GatewayIntent>;
  verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean;
  parseWebhook(rawBody: string): ParsedWebhookEvent;
}

/** Lançado por um adapter quando uma operação do contrato comum não existe de fato no gateway
 * concreto (ex.: `capture()` para PIX no Asaas). Erro de programação do caller, não de runtime
 * de rede — nunca deve ser tratado como "falha de pagamento". */
export class NotSupportedByGatewayError extends Error {
  constructor(
    public readonly gateway: Gateway,
    reason: string,
  ) {
    super(`Operação não suportada pelo gateway '${gateway}': ${reason}`);
    this.name = "NotSupportedByGatewayError";
  }
}
