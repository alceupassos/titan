// Escala de campo (virada, vistoria, manutenção) — seção 9.10.6 do prompt único: o comportamento
// de escala é sempre FUNÇÃO de `employmentType`, nunca uma constante fixa, porque a pergunta 3 de
// docs/decisoes-de-negocio.md segue pendente (ver comentário de `member.ts`). Mesmo princípio já
// usado em `../administration/administration-contract.ts` (`itemPaymentModel` configurável) e
// `../vendor/retention.ts` (`taxRegime` como dado).
import type { CivilDate } from "@titan/dates";
import type { EmploymentType } from "./member";

export type AssignmentMode = "mandatory" | "voluntary";

/**
 * `"employee"` → escala é ordem de trabalho (`mandatory`, sem aceite a fazer). `"contractor"` →
 * escala é oferta (`voluntary`, sujeita a aceite/recusa — subordinação de fato indevida é risco
 * trabalhista real, seção 9.10.6). `"unspecified"` → tratado como `voluntary`: padrão
 * conservador deliberado — nunca impor escala obrigatória a alguém cujo vínculo ainda não foi
 * confirmado pelo jurídico é mais seguro do que assumir `employee` por default e criar exposição
 * antes da resposta existir.
 */
export function resolveAssignmentMode(employmentType: EmploymentType): AssignmentMode {
  return employmentType === "employee" ? "mandatory" : "voluntary";
}

export type ShiftStatus = "proposed" | "accepted" | "declined" | "completed";

export interface ShiftAssignment {
  readonly id: string;
  readonly memberId: string;
  readonly date: CivilDate;
  readonly status: ShiftStatus;
}

export class MandatoryAssignmentCannotBeDeclinedError extends Error {
  constructor(assignmentId: string) {
    super(
      `Atribuição ${assignmentId} é de escala obrigatória (employmentType "employee") — não pode ` +
        "ser recusada. Se o vínculo real não é employee, corrija o cadastro do membro, não o " +
        "status desta atribuição.",
    );
    this.name = "MandatoryAssignmentCannotBeDeclinedError";
  }
}

/** Cria uma nova atribuição — nasce `accepted` se obrigatória (não há aceite a fazer), `proposed`
 * se voluntária (aguardando resposta do membro). Decisão de design não 100% especificada: o `id`
 * não é parâmetro (zero I/O proíbe `Math.random()`/uuid aqui) — é derivado deterministicamente
 * de `memberId:date`, assumindo no máximo uma atribuição por membro por dia civil (uma segunda
 * chamada para o mesmo par produz o mesmo id de propósito, para o chamador tratar como
 * upsert/conflito em vez de duplicata silenciosa). */
export function assignShift(
  memberId: string,
  date: CivilDate,
  employmentType: EmploymentType,
): ShiftAssignment {
  const mode = resolveAssignmentMode(employmentType);
  return { id: `${memberId}:${date}`, memberId, date, status: mode === "mandatory" ? "accepted" : "proposed" };
}

/** Nunca muta `assignment` — sempre retorna uma nova `ShiftAssignment`. Recusar uma atribuição
 * `mandatory` é erro de uso (a UI nunca deveria oferecer essa opção), não um caminho silencioso. */
export function respondToShiftAssignment(
  assignment: ShiftAssignment,
  employmentType: EmploymentType,
  response: "accepted" | "declined",
): ShiftAssignment {
  const mode = resolveAssignmentMode(employmentType);
  if (mode === "mandatory" && response === "declined") {
    throw new MandatoryAssignmentCannotBeDeclinedError(assignment.id);
  }
  return { ...assignment, status: response };
}
