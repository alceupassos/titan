// Helpers compartilhados por apps/console/app/(owner)/portal/page.tsx e ./extratos/page.tsx —
// conversão de linha crua do Drizzle para o tipo de domínio e formatação de exibição. Mesmo
// espírito de `toDomainRatePlan` em apps/console/app/(staff)/reservas/nova/actions.ts: a
// conversão fica num só lugar para que trocar a fonte de dados (amostra -> `./queries.ts` real)
// nunca precise duplicar a lógica de conversão/agregação — só o resultado da query muda, cálculo
// não.
import { civilDate, type CivilDate } from "@titan/dates";
import {
  resolveAdministrationContractForDate,
  type AdministrationContract,
} from "@titan/domain";
import type { administrationContracts, payoutBatches } from "@titan/db";

type AdministrationContractRow = typeof administrationContracts.$inferSelect;
type PayoutBatchRow = typeof payoutBatches.$inferSelect;

/** Converte a linha crua do Drizzle (`packages/db/src/schema/administration-contract.ts`) para o
 * tipo de domínio `AdministrationContract` (`packages/domain/src/administration/
 * administration-contract.ts`) — só `validFrom`/`validTo` (coluna `date`, string "YYYY-MM-DD")
 * precisam virar `CivilDate` (branded), o resto já bate campo a campo. */
export function toDomainAdministrationContract(row: AdministrationContractRow): AdministrationContract {
  return {
    id: row.id,
    tenantId: row.tenantId,
    unitId: row.unitId,
    commissionBasisPoints: row.commissionBasisPoints,
    itemPaymentModel: row.itemPaymentModel === "owner_pays_itemized" ? "owner_pays_itemized" : "titan_pays_all",
    validFrom: civilDate(row.validFrom),
    validTo: civilDate(row.validTo),
  };
}

/**
 * Resolve se o lote de repasse deve exibir a seção/coluna de despesas itemizadas — decisão que
 * depende do `AdministrationContract` vigente da unidade na data de início do período do lote
 * (`resolveAdministrationContractForDate`, zero I/O, mesma função usada por
 * `packages/domain/src/administration/payout-extract.ts`). Retorna `null` quando nenhum contrato
 * vigente é encontrado (ou há ambiguidade) — nunca assume um modelo padrão silenciosamente; o
 * chamador decide como comunicar essa lacuna de cadastro (ver `./extratos/page.tsx`).
 */
export function resolveItemPaymentModelForBatch(
  batch: PayoutBatchRow,
  contracts: readonly AdministrationContractRow[],
): AdministrationContract["itemPaymentModel"] | null {
  const domainContracts = contracts.map(toDomainAdministrationContract);
  try {
    const contract = resolveAdministrationContractForDate(domainContracts, {
      unitId: batch.unitId,
      date: civilDate(batch.periodStart) as CivilDate,
    });
    return contract.itemPaymentModel;
  } catch {
    // NoAdministrationContractForDateError / OverlappingAdministrationContractError — cadastro
    // incompleto ou ambíguo. Nunca escolhido silenciosamente; ver comentário do chamador.
    return null;
  }
}

const PERIOD_FORMATTER = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Formata um período `date` (string "YYYY-MM-DD") para exibição pt-BR — parse como UTC-meio-dia
 * para nunca cair no dia anterior por fuso (mesma cautela de `nights()` em `@titan/dates`). */
function formatCivilDate(value: string): string {
  return PERIOD_FORMATTER.format(new Date(`${value}T00:00:00Z`));
}

export function formatPeriod(periodStart: string, periodEnd: string): string {
  return `${formatCivilDate(periodStart)} – ${formatCivilDate(periodEnd)}`;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  pending_approval: "Aguardando aprovação",
  approved: "Aprovado",
  sent: "Enviado",
  failed: "Falhou",
};

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

export function statusTone(status: string): "positive" | "negative" | "warning" | "info" {
  switch (status) {
    case "sent":
      return "positive";
    case "failed":
      return "negative";
    case "pending_approval":
      return "warning";
    default:
      return "info";
  }
}
