// Vocabulário de status da OS técnica para o Portal do Prestador (Fase 7, Passo 4a —
// docs/fase-atual.md). Módulo próprio (não importado de
// apps/console/app/(staff)/limpeza/servicos/status.ts) — as duas faixas rodam em paralelo sobre
// diretórios diferentes nesta fase (docs/anti-padroes.md #21: duas faixas paralelas nunca
// escrevem no mesmo diretório), e um import cruzado entre route groups de faixas concorrentes
// acoplaria a UI do prestador à evolução independente da UI de staff sem necessidade real — os
// dois módulos descrevem o MESMO enum (`WorkOrderStatus`, `@titan/domain`), nunca dois vocabulários
// divergentes.
import { canTransitionWorkOrder, type WorkOrderStatus } from "@titan/domain";

export const WORK_ORDER_STATUS_LABEL: Record<WorkOrderStatus, string> = {
  opened: "Aberta",
  triage: "Triagem",
  budget: "Orçamento",
  dispatched: "Despachada",
  accepted_vendor: "Aceita por mim",
  executing: "Em execução",
  accepted_titan: "Aceita pela Titan",
  rework: "Retrabalho solicitado",
  billed: "Faturada",
  paid: "Paga",
  rated: "Avaliada",
};

/**
 * Ação (verbo, não nome de estado) que o PRÓPRIO prestador tem iniciativa de disparar a partir do
 * seu estado atual — subconjunto das transições válidas da FSM real
 * (`packages/domain/src/work-order/state-machine.ts`). `canTransitionWorkOrder` é sempre
 * reconferido em `nextVendorAction` abaixo antes de expor o botão — esta tabela nunca é a única
 * fonte de verdade sozinha, só a curadoria de QUAL das transições válidas faz sentido como ação do
 * prestador.
 *
 * Decisão de design desta faixa (documentada, não 100% especificada no prompt): a FSM permite
 * `executing -> rework` tecnicamente, mas essa transição específica é sempre uma decisão do
 * REVISOR (Titan, painel de `.../limpeza/revisao`), nunca algo que o prestador aciona sobre o
 * próprio trabalho em andamento — por isso não vira botão aqui, mesmo sendo uma transição válida
 * da FSM. `rework -> executing` (retomar execução depois de reprovado) aparece normalmente, porque
 * essa sim é iniciativa do prestador.
 */
const VENDOR_ACTION_BY_STATUS: Partial<Record<WorkOrderStatus, { toStatus: WorkOrderStatus; label: string }>> = {
  dispatched: { toStatus: "accepted_vendor", label: "Aceitar" },
  accepted_vendor: { toStatus: "executing", label: "Iniciar execução" },
  executing: { toStatus: "accepted_titan", label: "Concluir" },
  rework: { toStatus: "executing", label: "Reiniciar execução" },
};

export interface VendorAction {
  readonly toStatus: WorkOrderStatus;
  readonly label: string;
}

/** Devolve a única ação disponível ao prestador a partir de `from`, ou `undefined` se nenhuma se
 * aplica (estado anterior ao despacho, ou estado terminal/pós-execução do lado da Titan em
 * diante) — sempre reconfirmando com `canTransitionWorkOrder` (o árbitro real da FSM), nunca só a
 * tabela curada acima. */
export function nextVendorAction(from: WorkOrderStatus): VendorAction | undefined {
  const candidate = VENDOR_ACTION_BY_STATUS[from];
  if (!candidate) {
    return undefined;
  }
  return canTransitionWorkOrder(from, candidate.toStatus) ? candidate : undefined;
}
