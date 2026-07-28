// Endpoint HTTP de recebimento de webhook dos gateways de pagamento (Fase 2, Passo 5 —
// docs/fase-atual.md). Decisão de design: `node:http` puro, sem framework (Fastify/Express) —
// o processo já é persistente (seção 5.5 do prompt único), o roteamento é de uma rota só
// (`POST /webhooks/:gateway`), e a exigência crítica de I6 (corpo cru EXATO para a verificação de
// assinatura do Stripe, antes de qualquer `JSON.parse`) é mais simples de garantir lendo os bytes
// da requisição manualmente do que confiando no body parser automático de um framework, que
// tipicamente já entrega o body parseado e descarta o cru. Menos uma dependência, mesmo
// resultado.
//
// A lógica de tratamento (`handleWebhookRequest`) é separada do listener real de `node:http`
// (`createHttpServer`) de propósito: testes chamam `handleWebhookRequest` direto com objetos
// simples (sem abrir socket real), injetando os três pontos de I/O (resolver adapter, dedupe em
// `webhook_events`, enfileirar job) — mesmo padrão de injeção de dependência já usado no adapter
// Asaas (`fetchFn`).
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { Gateway, PaymentGatewayAdapter } from "@titan/payments";
import type { WebhookJobPayload } from "./queue";

/**
 * Nome do header de assinatura por gateway — varia porque o mecanismo de verificação varia
 * (I6): Stripe usa HMAC assinado sobre o corpo (`stripe-signature`, verificado por
 * `stripe.webhooks.constructEvent` dentro do adapter); Asaas usa um token estático ecoado pelo
 * próprio Asaas (`asaas-access-token` — TODO, ver comentário em
 * `packages/payments/src/asaas/adapter.ts`: nome exato do header não confirmado contra a doc
 * vigente nesta sessão).
 */
const GATEWAY_SIGNATURE_HEADER: Readonly<Record<Gateway, string>> = {
  stripe: "stripe-signature",
  asaas: "asaas-access-token",
};

export interface WebhookHandlerDeps {
  /** Resolve o adapter configurado para o segmento de URL recebido (`asaas`/`stripe`).
   * `undefined` cobre tanto "gateway desconhecido" quanto "gateway sem credenciais configuradas
   * neste ambiente" — tratados da mesma forma pelo handler (404). */
  resolveAdapter(gatewayParam: string): PaymentGatewayAdapter | undefined;
  /** `true` se o evento é novo (INSERT teve sucesso — dedupe de I6); `false` se já existia
   * (`ON CONFLICT DO NOTHING` não retornou linha). */
  insertWebhookEventIfNew(gateway: Gateway, externalEventId: string): Promise<boolean>;
  enqueueWebhookJob(payload: WebhookJobPayload): Promise<void>;
  logger?: Pick<Console, "log" | "error" | "warn">;
}

export interface WebhookRequestInput {
  readonly gatewayParam: string;
  readonly rawBody: string;
  readonly headers: IncomingHttpHeaders;
}

export interface WebhookResponse {
  readonly status: number;
  readonly body: string;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Lógica pura de tratamento de um webhook recebido — sem `node:http` no meio, para ser
 * chamável diretamente em teste. Ordem do fluxo (I6, seção "Sua tarefa" do plano aprovado):
 * resolve adapter -> verifica assinatura -> parseia -> dedupe -> enfileira.
 */
export async function handleWebhookRequest(
  input: WebhookRequestInput,
  deps: WebhookHandlerDeps,
): Promise<WebhookResponse> {
  const log = deps.logger ?? console;

  const adapter = deps.resolveAdapter(input.gatewayParam);
  if (!adapter) {
    log.warn(`[webhook] gateway desconhecido ou não configurado neste ambiente: "${input.gatewayParam}".`);
    return { status: 404, body: JSON.stringify({ error: `gateway desconhecido: ${input.gatewayParam}` }) };
  }

  const headerName = GATEWAY_SIGNATURE_HEADER[adapter.gateway];
  const signatureHeader = firstHeaderValue(input.headers[headerName]);
  if (!signatureHeader) {
    log.error(`[webhook] requisição ${adapter.gateway} sem header "${headerName}" — rejeitada sem processar (I6).`);
    return { status: 401, body: JSON.stringify({ error: "assinatura ausente" }) };
  }

  let signatureValid: boolean;
  try {
    signatureValid = adapter.verifyWebhookSignature(input.rawBody, signatureHeader);
  } catch (err) {
    log.error(`[webhook] erro ao verificar assinatura (${adapter.gateway}): ${(err as Error).message}`);
    return { status: 401, body: JSON.stringify({ error: "falha ao verificar assinatura" }) };
  }
  if (!signatureValid) {
    log.error(`[webhook] assinatura inválida (${adapter.gateway}) — payload descartado sem processar (I6).`);
    return { status: 401, body: JSON.stringify({ error: "assinatura inválida" }) };
  }

  let parsed;
  try {
    parsed = adapter.parseWebhook(input.rawBody);
  } catch (err) {
    log.error(`[webhook] falha ao parsear payload (${adapter.gateway}): ${(err as Error).message}`);
    return { status: 400, body: JSON.stringify({ error: "payload inválido" }) };
  }

  const isNewEvent = await deps.insertWebhookEventIfNew(adapter.gateway, parsed.externalEventId);
  if (!isNewEvent) {
    log.log(`[webhook] evento "${parsed.externalEventId}" (${adapter.gateway}) já processado — dedupe (I6), nada reenfileirado.`);
    return { status: 200, body: JSON.stringify({ ok: true, deduped: true }) };
  }

  await deps.enqueueWebhookJob({
    gateway: adapter.gateway,
    externalEventId: parsed.externalEventId,
    externalIntentId: parsed.externalIntentId,
    newStatus: parsed.newStatus,
  });
  log.log(`[webhook] evento "${parsed.externalEventId}" (${adapter.gateway}) enfileirado para processamento assíncrono.`);
  return { status: 200, body: JSON.stringify({ ok: true }) };
}

const ROUTE_PATTERN = /^\/webhooks\/([a-zA-Z0-9_-]+)\/?$/;

/** Listener real de `node:http` — rota única `POST /webhooks/:gateway`. Lê o corpo cru completo
 * antes de chamar `handleWebhookRequest` (nunca `JSON.parse` aqui: quem decide o que fazer com o
 * corpo é o adapter, dentro de `verifyWebhookSignature`/`parseWebhook`). */
export function createHttpServer(deps: WebhookHandlerDeps): Server {
  return createServer((req, res) => {
    const log = deps.logger ?? console;
    const url = req.url ?? "";
    const match = ROUTE_PATTERN.exec(url);

    if (req.method !== "POST" || !match) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "rota não encontrada" }));
      return;
    }

    const gatewayParam = match[1]!;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const rawBody = Buffer.concat(chunks).toString("utf8");
      handleWebhookRequest({ gatewayParam, rawBody, headers: req.headers }, deps)
        .then(({ status, body }) => {
          res.writeHead(status, { "Content-Type": "application/json" });
          res.end(body);
        })
        .catch((err: unknown) => {
          log.error(`[webhook] erro inesperado processando requisição: ${(err as Error).message}`);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "erro interno" }));
        });
    });
    req.on("error", (err) => {
      log.error(`[webhook] erro lendo corpo da requisição: ${err.message}`);
      if (!res.headersSent) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "erro ao ler corpo" }));
      }
    });
  });
}
