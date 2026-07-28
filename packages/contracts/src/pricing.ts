// Contratos de pricing (Fase 8, Passo 3 — docs/fase-atual.md). Disparo de execução da sugestão,
// publicação de preço final (sempre recalculado/validado contra o piso no servidor, nunca aceito
// cego do cliente — mesmo princípio de preço/cotação desde a Fase 1) e configuração de autonomia
// por unidade (sugestão vs. automático, seção 9.7). Mesmo espírito de
// packages/contracts/src/supply.ts: fonte única de validação Zod, espelhando o vocabulário de
// packages/domain/src/pricing/ sem depender desse pacote.
import { z } from "zod";

const uuidSchema = z.string().uuid();
const civilDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato YYYY-MM-DD (data civil, sem hora/fuso).");

export const RunPricingSuggestionSchema = z.object({
  unitId: uuidSchema,
  date: civilDateSchema,
});
export type RunPricingSuggestion = z.infer<typeof RunPricingSuggestionSchema>;

// `finalPriceCents` aqui é só o valor que o operador CONFIRMA ter visto na sugestão — a Server
// Action sempre recalcula o piso e a sugestão no servidor antes de aceitar a publicação; nunca
// publica um valor arbitrário só porque o cliente enviou.
export const PublishPriceSchema = z.object({
  unitId: uuidSchema,
  date: civilDateSchema,
  finalPriceCents: z.number().int().positive(),
});
export type PublishPrice = z.infer<typeof PublishPriceSchema>;

export const SetPricingAutonomySchema = z.object({
  unitId: uuidSchema,
  mode: z.enum(["suggestion", "auto"]),
  maxDailyVariationBasisPoints: z.number().int().min(0).max(10000),
});
export type SetPricingAutonomy = z.infer<typeof SetPricingAutonomySchema>;
