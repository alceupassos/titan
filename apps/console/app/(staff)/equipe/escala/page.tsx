// Escala e custódia de acesso (Fase 9, Passo 4b — docs/fase-atual.md; seção 9.10.6 do prompt
// único). Dados exibidos são AMOSTRA ESTÁTICA (../sample-data.ts) — não há Postgres vivo nesta
// máquina (Docker Desktop parado, "Gap conhecido 2"), mesmo padrão de
// apps/console/app/(staff)/limpeza/page.tsx. Os cálculos abaixo (`resolveAssignmentMode`,
// `activeCredentialsForMember`) são, ainda assim, feitos DE VERDADE sobre a amostra com a MESMA
// lógica de domínio que uma query real usaria — trocar a fonte por ../queries.ts é a única
// mudança necessária quando o banco estiver de pé.
//
// O CAMINHO DE ESCRITA (`assignShiftAction`, `respondToShiftAssignmentAction`,
// `issueAccessCredentialAction`, `transferAccessCredentialAction`, `dismissMemberAction` —
// ../actions.ts, chamados pelo client component abaixo) já é real, contra o banco via
// `withTenant`.
import { activeCredentialsForMember, resolveAssignmentMode } from "@titan/domain";
import { PageHeader } from "@/components/PageHeader";
import {
  SAMPLE_ACCESS_CREDENTIAL_CHAIN,
  SAMPLE_MEMBERS,
  SAMPLE_SHIFT_ASSIGNMENTS,
} from "../sample-data";
import {
  ScheduleAccessBoard,
  type AccessCredentialTypeSample,
  type EmploymentTypeSample,
  type MemberBoardRow,
  type MemberOption,
  type ShiftStatusSample,
} from "./ScheduleAccessBoard";

export default function EscalaPage() {
  // Só membros ativos entram no quadro de escala/custódia — um membro `dismissed` já teve toda
  // credencial ativa revogada (dismissMember, packages/domain/src/workforce/offboarding.ts) e não
  // recebe nova escala.
  const activeMembers = SAMPLE_MEMBERS.filter((member) => member.status === "active");

  const rows: MemberBoardRow[] = activeMembers.map((member) => {
    const employmentType = member.employmentType as EmploymentTypeSample;
    // `resolveAssignmentMode` (packages/domain/src/workforce/assignment.ts) é a ÚNICA fonte da
    // regra "employee -> mandatory, contractor/unspecified -> voluntary" — nunca recalculada à
    // mão na UI, mesmo espírito de I9 (a regra de negócio mora no domínio, a página só exibe).
    const assignmentMode = resolveAssignmentMode(employmentType);

    const shifts = SAMPLE_SHIFT_ASSIGNMENTS.filter((assignment) => assignment.memberId === member.id).map(
      (assignment) => ({
        id: assignment.id,
        date: assignment.date,
        status: assignment.status as ShiftStatusSample,
      }),
    );

    // Nunca um campo mutável separado — sempre recalculado sobre a cadeia INTEIRA via
    // `activeCredentialsForMember` (packages/domain/src/workforce/access-custody.ts), mesmo
    // princípio de I10 aplicado à custódia de acesso.
    const activeCredentials = activeCredentialsForMember(SAMPLE_ACCESS_CREDENTIAL_CHAIN, member.id).map((event) => ({
      credentialType: event.credentialType as AccessCredentialTypeSample,
      credentialId: event.credentialId,
    }));

    return {
      memberId: member.id,
      fullName: member.fullName,
      role: member.role,
      employmentType,
      assignmentMode,
      shifts,
      activeCredentials,
    };
  });

  const memberOptions: MemberOption[] = SAMPLE_MEMBERS.map((member) => ({
    id: member.id,
    fullName: member.fullName,
    status: member.status as MemberOption["status"],
  }));

  return (
    <div className="p-6">
      <PageHeader
        title="Escala e custódia de acesso"
        description="Atribuir/responder escala e emitir/transferir credencial de acesso, por membro. Dados de amostra (sem Postgres vivo nesta máquina; ver docs/fase-atual.md)."
      />
      <ScheduleAccessBoard rows={rows} memberOptions={memberOptions} />
    </div>
  );
}
