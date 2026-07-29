// Contrato de cadastro de unidade (Planoexplica.md, "cadastrar unidade") — fonte única de
// validação Zod para a Server Action de criação, espelhando `packages/db/src/schema/unit.ts`
// sem depender desse pacote (mesmo espírito de todos os outros arquivos deste pacote).
import { z } from "zod";

// Mesmos 8 valores de UnitStatus (packages/domain/src/unit/state-machine.ts) — só os 2 que fazem
// sentido como estado INICIAL de uma unidade recém-cadastrada aparecem no formulário
// (apps/console/app/(staff)/unidades/nova/page.tsx); o schema aceita os 8 para não duplicar a
// união em dois lugares com listas divergentes.
const unitStatusSchema = z.enum([
  "ready",
  "occupied",
  "dirty",
  "cleaning",
  "clean",
  "inspected",
  "blocked",
  "rework",
]);

export const CreateUnitSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório."),
  status: unitStatusSchema.default("ready"),
  // Nullable/opcional de propósito — nunca inventar área/capacidade/categoria quando o usuário
  // não informa (mesma disciplina de guestCount em reservations).
  areaSqm: z.number().int().positive().optional(),
  maxCapacity: z.number().int().positive().optional(),
  category: z.string().min(1).optional(),
});
export type CreateUnit = z.infer<typeof CreateUnitSchema>;
