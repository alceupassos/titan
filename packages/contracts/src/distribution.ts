// Contratos de distribuição/canais (Fase 3, Passo 3 — docs/fase-atual.md). Payload de correção
// assistida de divergência no cockpit ((staff)/distribuicao) — mesmo espírito de
// `packages/contracts/src/approval.ts`: fonte única de validação Zod para a Server Action,
// espelhando o vocabulário de `packages/domain/src/channel/divergence.ts` sem depender do pacote
// de domínio (este pacote é consumido por client components, não deve arrastar lógica de
// domínio para o bundle do navegador).
import { z } from "zod";

const uuidSchema = z.string().uuid();

export const ChannelSchema = z.enum(["direct", "airbnb", "booking", "vrbo", "expedia"]);
export type ChannelValue = z.infer<typeof ChannelSchema>;

// "accept_remote": aceita o valor visto no canal como correto, corrige o dado local.
// "accept_local": aceita o valor local como correto, reenvia (push) para o canal.
export const ResolveDivergenceSchema = z.object({
  divergenceId: uuidSchema,
  resolution: z.enum(["accept_remote", "accept_local"]),
  note: z.string().optional(),
});
export type ResolveDivergence = z.infer<typeof ResolveDivergenceSchema>;

// Reenvio manual de um item da DLQ (seção 9.2 do prompt único: "DLQ com reprocesso pelo
// cockpit") — identifica o registro de channel_sync_log com falha a reprocessar.
export const RetrySyncSchema = z.object({
  channelSyncLogId: uuidSchema,
});
export type RetrySync = z.infer<typeof RetrySyncSchema>;

// Kill switch manual por canal (ADR-0020 — mitigação de risco da automação via navegador do
// Airbnb): desliga/religa um adapter específico sem precisar de deploy.
export const ToggleChannelAdapterSchema = z.object({
  channel: ChannelSchema,
  enabled: z.boolean(),
});
export type ToggleChannelAdapter = z.infer<typeof ToggleChannelAdapterSchema>;
