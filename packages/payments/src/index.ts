// Barrel do pacote @titan/payments (Fase 2 — docs/roadmap.md). Reexporta a porta comum
// (`port.ts`) e os adapters concretos por gateway. Cada faixa paralela (Asaas, Stripe, ...)
// adiciona sua própria reexportação aqui sem mexer no que a outra já exportou.
export type {
  Cents,
  CreateIntentParams,
  Gateway,
  GatewayIntent,
  ParsedWebhookEvent,
  PaymentGatewayAdapter,
  RefundParams,
} from "./port";
export { NotSupportedByGatewayError } from "./port";

export type { AsaasAdapterConfig } from "./asaas/adapter";
export { createAsaasAdapter } from "./asaas/adapter";

export type { StripeAdapterConfig } from "./stripe/adapter";
export { createStripeAdapter, StripeAdapter } from "./stripe/adapter";
