// Contratos de suprimentos e prestadores (Fase 7, Passo 3 — docs/fase-atual.md). Registro de
// movimento de estoque, atualização de perfil de prestador (regime fiscal + compliance) e
// avaliação de prestador após OS concluída, mais o disparo de pagamento com retenção calculada no
// servidor — mesmo espírito de packages/contracts/src/housekeeping.ts: fonte única de validação
// Zod, espelhando o vocabulário de packages/domain/src/supply/ e packages/domain/src/vendor/ sem
// depender desses pacotes (consumido por client components).
import { z } from "zod";

const uuidSchema = z.string().uuid();

// Registro de movimento de estoque — quantity sempre positivo, a direção vem de `type` (mesmo
// shape de StockMovement em packages/domain/src/supply/stock.ts). O saldo materializado
// (stock_balances) é atualizado pela Server Action na mesma transação, nunca calculado aqui.
export const RecordStockMovementSchema = z.object({
  unitId: uuidSchema,
  itemType: z.string().min(1),
  type: z.enum(["purchase", "consumption", "adjustment", "loss", "return"]),
  quantity: z.number().int().positive(),
  reference: z.record(z.string(), z.unknown()).optional(),
});
export type RecordStockMovement = z.infer<typeof RecordStockMovementSchema>;

// Atualização de perfil de prestador (regime de tributação + status de compliance manual — sem
// integração real com Receita/Caixa/FGTS nesta fase, ver docs/fase-atual.md).
export const UpdateVendorProfileSchema = z.object({
  vendorId: uuidSchema,
  taxRegime: z.enum(["pj_cessao_mao_obra", "pj_simples", "pf_autonomo"]),
  complianceStatus: z.enum(["pending", "compliant", "non_compliant"]),
});
export type UpdateVendorProfile = z.infer<typeof UpdateVendorProfileSchema>;

// Avaliação do prestador ao concluir uma OS — nota 0-5, alimenta computeVendorScoreAverage
// (packages/domain/src/vendor/compliance.ts). Redução deliberada de escopo: média simples, não o
// scorecard multi-critério ponderado da seção 9.10.4.
export const RateVendorAfterWorkOrderSchema = z.object({
  workOrderId: uuidSchema,
  vendorId: uuidSchema,
  rating: z.number().min(0).max(5),
});
export type RateVendorAfterWorkOrder = z.infer<typeof RateVendorAfterWorkOrderSchema>;

// Disparo de pagamento de conta a pagar de prestador — o cálculo de retenção
// (calculateVendorRetentionAmountsCents) é sempre feito no servidor a partir da
// VendorRetentionRule vigente; este schema nunca aceita um `retentionBreakdown` do cliente (mesmo
// princípio de preço/comissão recalculados no servidor desde a Fase 1/5).
export const PayVendorInvoiceSchema = z.object({
  accountsPayableId: uuidSchema,
});
export type PayVendorInvoice = z.infer<typeof PayVendorInvoiceSchema>;
