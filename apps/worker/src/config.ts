// Configuração do worker a partir de variáveis de ambiente (Fase 2, Passo 5 —
// docs/fase-atual.md). Centralizado aqui para que `index.ts` (bootstrap real) e os testes de
// `http-server.test.ts`/`jobs/process-webhook.test.ts` (injeção de dependência, sem rede real)
// não dupliquem a leitura de env.
//
// Design: `loadConfigFromEnv` recebe `env` como parâmetro (default `process.env`) só para poder
// ser testado com um objeto fake — mesmo espírito do `fetchFn` injetável do adapter Asaas
// (packages/payments/src/asaas/adapter.ts).
import {
  createAsaasAdapter,
  createStripeAdapter,
  type AsaasAdapterConfig,
  type PaymentGatewayAdapter,
  type StripeAdapterConfig,
} from "@titan/payments";

export interface WorkerConfig {
  readonly asaas?: AsaasAdapterConfig;
  readonly stripe?: StripeAdapterConfig;
  readonly databaseAdminUrl: string;
  readonly redisUrl: string;
  readonly httpPort: number;
}

type EnvSource = Record<string, string | undefined>;

/**
 * Lê a configuração dos dois gateways a partir do env. Cada gateway só entra no mapa de adapters
 * resolvíveis (`buildAdapterResolver`) se TODAS as variáveis obrigatórias dele estiverem
 * presentes — preferível a construir um adapter com config parcial que falharia de forma confusa
 * na primeira chamada de rede.
 */
export function loadConfigFromEnv(env: EnvSource = process.env): WorkerConfig {
  const asaasApiUrl = env.ASAAS_API_URL;
  const asaasApiKey = env.ASAAS_API_KEY;
  const asaasWebhookToken = env.ASAAS_WEBHOOK_TOKEN;
  const asaas: AsaasAdapterConfig | undefined =
    asaasApiUrl && asaasApiKey && asaasWebhookToken
      ? { apiUrl: asaasApiUrl, apiKey: asaasApiKey, webhookToken: asaasWebhookToken }
      : undefined;

  const stripeSecretKey = env.STRIPE_SECRET_KEY;
  const stripeWebhookSecret = env.STRIPE_WEBHOOK_SECRET;
  // StripeAdapterConfig aceita apiKey/webhookSecret ausentes (cai para env dentro do próprio
  // adapter) — mas aqui só consideramos o gateway "configurado" se pelo menos a chave secreta
  // estiver presente; sem ela o construtor de StripeAdapter já lança um erro claro.
  // `exactOptionalPropertyTypes` (tsconfig.base.json) exige que `webhookSecret` só apareça no
  // objeto quando de fato tem valor — nunca `webhookSecret: undefined` explícito.
  const stripe: StripeAdapterConfig | undefined = stripeSecretKey
    ? { apiKey: stripeSecretKey, ...(stripeWebhookSecret ? { webhookSecret: stripeWebhookSecret } : {}) }
    : undefined;

  return {
    // Mesma razão acima: só inclui `asaas`/`stripe` no objeto quando resolvidos, nunca como
    // `undefined` explícito (WorkerConfig os declara opcionais, não nuláveis).
    ...(asaas ? { asaas } : {}),
    ...(stripe ? { stripe } : {}),
    // Mesmo default de packages/db/seed/index.ts — conexão ADMIN (superusuário `titan`, ignora
    // RLS) usada só para resolver o tenant de um evento externo (ver admin-db.ts).
    databaseAdminUrl: env.DATABASE_ADMIN_URL ?? "postgresql://titan:titan_dev_only@localhost:5432/titan_dev",
    redisUrl: env.REDIS_URL ?? "redis://localhost:6379",
    httpPort: env.WEBHOOK_HTTP_PORT ? Number(env.WEBHOOK_HTTP_PORT) : 3100,
  };
}

/**
 * Constrói o mapa `gateway -> adapter` a partir da config resolvida. Retorna uma função de
 * lookup (não o `Map` diretamente) para o handler HTTP poder tratar "gateway desconhecido" e
 * "gateway não configurado neste ambiente" da mesma forma (404), sem expor a estrutura interna.
 */
export function buildAdapterResolver(config: WorkerConfig): (gatewayParam: string) => PaymentGatewayAdapter | undefined {
  const adapters = new Map<string, PaymentGatewayAdapter>();
  if (config.asaas) {
    adapters.set("asaas", createAsaasAdapter(config.asaas));
  }
  if (config.stripe) {
    adapters.set("stripe", createStripeAdapter(config.stripe));
  }
  return (gatewayParam: string) => adapters.get(gatewayParam);
}
