// Fila BullMQ de processamento assíncrono de webhook de pagamento (Fase 2, Passo 5). O handler
// HTTP (`http-server.ts`) só enfileira e responde 200 imediatamente — nenhum side-effect pesado
// (resolução de tenant, transição de estado I2, postagem de ledger) roda dentro do handler.
import { Queue, Worker, type ConnectionOptions } from "bullmq";
import type { Gateway, ParsedWebhookEvent } from "@titan/payments";

export const WEBHOOK_QUEUE_NAME = "payment-webhooks";

/**
 * Payload do job — deliberadamente mais estreito que `ParsedWebhookEvent` (não carrega `raw`):
 * o payload cru do gateway pode ter campos não essenciais para o processamento e persistiria em
 * Redis pelo tempo de vida do job; menos superfície, menos risco de logar algo indevido depois
 * (I4/LGPD básico, mesmo espírito da nota em `packages/payments/src/port.ts` sobre nunca logar
 * `raw` sem checar antes).
 */
export interface WebhookJobPayload {
  readonly gateway: Gateway;
  readonly externalEventId: string;
  readonly externalIntentId: string;
  readonly newStatus: ParsedWebhookEvent["newStatus"];
}

export function createWebhookQueue(connection: ConnectionOptions): Queue<WebhookJobPayload> {
  return new Queue<WebhookJobPayload>(WEBHOOK_QUEUE_NAME, { connection });
}

export function createWebhookWorker(
  connection: ConnectionOptions,
  processFn: (payload: WebhookJobPayload) => Promise<void>,
): Worker<WebhookJobPayload> {
  return new Worker<WebhookJobPayload>(
    WEBHOOK_QUEUE_NAME,
    async (job) => {
      await processFn(job.data);
    },
    { connection },
  );
}
