// Schemas Zod extraídos de ./actions.ts (Fase 9, Passo 5 — docs/fase-atual.md). Motivo real da
// extração: um arquivo `"use server"` só pode exportar funções async — importar `OpenWorkOrderSchema`
// (um objeto Zod, export de valor em tempo de execução) de dentro de ./actions.ts para um Route
// Handler (apps/console/app/api/field/work-orders/route.ts) quebrava o build com "A 'use server'
// file can only export async functions, found object" (erro real encontrado nesta sessão). Este
// arquivo NÃO tem a diretiva `"use server"` — pode exportar valores livremente; ./actions.ts
// reimporta os schemas daqui para uso interno, mantendo o mesmo comportamento de validação.
import { z } from "zod";

// Os 10 valores de ServiceType (packages/domain/src/housekeeping/checklist.ts) — mesma
// enumeração usada por ../checklists/actions.ts, reaproveitada aqui porque `work_orders` cobre o
// mesmo vocabulário de tipo de serviço da seção 9.8.4.
const ServiceTypeSchema = z.enum([
  "limpeza_saida",
  "limpeza_intermediaria",
  "limpeza_profunda",
  "dedetizacao",
  "ar_condicionado",
  "piscina",
  "estofado",
  "jardinagem",
  "manutencao_corretiva",
  "vistoria",
]);

// Espelha `WorkOrderStatus` de packages/domain/src/work-order/state-machine.ts — os 11 valores da
// FSM (seção 9.10.2).
const WorkOrderStatusSchema = z.enum([
  "opened",
  "triage",
  "budget",
  "dispatched",
  "accepted_vendor",
  "executing",
  "accepted_titan",
  "rework",
  "billed",
  "paid",
  "rated",
]);

export const OpenWorkOrderSchema = z.object({
  unitId: z.string().uuid(),
  serviceType: ServiceTypeSchema,
  description: z.string().min(1, "Descrição da OS é obrigatória."),
  vendorId: z.string().uuid().optional(),
});
export type OpenWorkOrderInput = z.infer<typeof OpenWorkOrderSchema>;

export const TransitionWorkOrderSchema = z.object({
  workOrderId: z.string().uuid(),
  toStatus: WorkOrderStatusSchema,
});
export type TransitionWorkOrderInput = z.infer<typeof TransitionWorkOrderSchema>;
