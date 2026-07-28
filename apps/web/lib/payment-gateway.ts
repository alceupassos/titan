// Resolução do gateway de pagamento por método (Fase 2, Passo 6 — integração final). Roteamento
// simples por método nesta fase (PIX -> Asaas, cartão internacional -> Stripe) — não o roteador
// declarativo completo de custo/taxa de aprovação da seção 9.3 do prompt único, que é fase
// futura. Credenciais vêm só de variáveis de ambiente (nunca hardcoded) — sem elas configuradas
// nesta máquina (ver docs/runbook-pagamentos.md), lança `GatewayNotConfiguredError`, nunca segue
// com uma chamada que falharia silenciosamente.
import { createAsaasAdapter, createStripeAdapter, type Gateway, type PaymentGatewayAdapter } from "@titan/payments";

export class GatewayNotConfiguredError extends Error {
  constructor(gateway: Gateway) {
    super(
      `Gateway '${gateway}' sem credenciais configuradas nesta máquina — ver docs/runbook-pagamentos.md. ` +
        "A reserva continua válida; o pagamento fica pendente de integração.",
    );
    this.name = "GatewayNotConfiguredError";
  }
}

export function resolveGatewayAdapter(method: "pix" | "card"): {
  gateway: Gateway;
  adapter: PaymentGatewayAdapter;
} {
  if (method === "pix") {
    const apiUrl = process.env.ASAAS_API_URL;
    const apiKey = process.env.ASAAS_API_KEY;
    const webhookToken = process.env.ASAAS_WEBHOOK_TOKEN;
    if (!apiUrl || !apiKey || !webhookToken) {
      throw new GatewayNotConfiguredError("asaas");
    }
    return { gateway: "asaas", adapter: createAsaasAdapter({ apiUrl, apiKey, webhookToken }) };
  }

  const apiKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!apiKey || !webhookSecret) {
    throw new GatewayNotConfiguredError("stripe");
  }
  return { gateway: "stripe", adapter: createStripeAdapter({ apiKey, webhookSecret }) };
}
