// Painel de Produtividade (Fase 9, Passo 4c — docs/fase-atual.md; seção 9.10 do prompt único).
// Dados exibidos são AMOSTRA ESTÁTICA (./sample-data.ts) — não há Postgres vivo nesta máquina
// (Docker Desktop parado, "Gap conhecido 2"), mesmo padrão de ../page.tsx e
// apps/console/app/(staff)/estoque/page.tsx. Os cálculos abaixo (contagem por membro, sinalização
// de possível reuso de evidência) são, ainda assim, feitos DE VERDADE sobre a amostra com a MESMA
// lógica que uma leitura real (./queries.ts::getTaskCompletionRecords()) usaria — trocar a fonte é
// a única mudança necessária quando o banco estiver de pé.
//
// O CAMINHO DE ESCRITA (`recordTaskCompletionAction` — ./actions.ts) já é real, contra o banco via
// `withTenant`; esta página em si não chama nenhuma Server Action (não há formulário de registro
// aqui nesta fase — o registro de conclusão de tarefa é feito pelo app de campo, `apps/field`,
// consumidor real do mesmo contrato `RecordTaskCompletionSchema`).
import { KpiCard, StatusPill } from "@titan/ui";
import { computeProductivityScore, flagSuspiciousCompletions, type EmploymentType } from "@titan/domain";
import { PageHeader } from "@/components/PageHeader";
import { SAMPLE_MEMBERS } from "../sample-data";
import { SAMPLE_SUSPICIOUS_THRESHOLD_BITS, SAMPLE_TASK_COMPLETION_RECORDS } from "./sample-data";

// Mesmos rótulos de apps/console/app/(staff)/equipe/escala/ScheduleAccessBoard.tsx
// (`EMPLOYMENT_LABEL`) — não exportado de lá (client component de outra sub-rota), reproduzido
// aqui em vez de importado através de um client component, para manter este arquivo Server
// Component puro.
const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  employee: "CLT (employee)",
  contractor: "PJ (contractor)",
  unspecified: "Vínculo não confirmado",
};

export default function ProdutividadePage() {
  const records = SAMPLE_TASK_COMPLETION_RECORDS;
  const flags = flagSuspiciousCompletions(records, SAMPLE_SUSPICIOUS_THRESHOLD_BITS);

  // `flagSuspiciousCompletions` devolve `taskId`/`suspectedDuplicateOfTaskId`, não `memberId`
  // diretamente (a função já garante internamente que a comparação é só intra-membro — ver
  // packages/domain/src/workforce/productivity.ts) — reconstituído aqui via `taskId -> memberId`
  // só para agrupar a exibição por linha de membro, nunca para reabrir a comparação cross-membro
  // que a função deliberadamente não faz.
  const memberIdByTaskId = new Map(records.map((record) => [record.taskId, record.memberId] as const));

  const rows = SAMPLE_MEMBERS.map((member) => ({
    member,
    score: computeProductivityScore(records, member.id),
    flags: flags.filter((flag) => memberIdByTaskId.get(flag.taskId) === member.id),
  }));

  const membersWithFlags = rows.filter((row) => row.flags.length > 0).length;

  return (
    <div className="p-6">
      <PageHeader
        title="Produtividade"
        description="Contagem de tarefas concluídas por membro e sinalização de possível reuso de evidência. Dados de amostra (sem Postgres vivo nesta máquina; ver docs/fase-atual.md)."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Tarefas concluídas (amostra)" value={String(records.length)} />
        <KpiCard label="Membros cadastrados" value={String(SAMPLE_MEMBERS.length)} />
        <KpiCard
          label="Membros com sinalização"
          value={String(membersWithFlags)}
          trend={membersWithFlags > 0 ? "down" : "flat"}
        />
        <KpiCard
          label="Sinalizações totais"
          value={String(flags.length)}
          trend={flags.length > 0 ? "down" : "flat"}
        />
      </div>

      <div className="mb-6 rounded-card border border-border bg-surface p-4 text-sm text-fg-muted">
        <p>
          <strong className="font-medium text-fg">A sinalização nunca bloqueia o registro.</strong> A
          contagem de tarefas concluídas é uma heurística determinística —{" "}
          <strong className="font-medium text-fg">não é o cálculo de remuneração variável real</strong>
          . A sinalização de possível reuso de foto de evidência entre tarefas do MESMO membro existe
          só para <strong className="font-medium text-fg">revisão humana</strong>: nenhuma conclusão
          de tarefa deixa de ser registrada por causa dela.
        </p>
      </div>

      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-label text-fg-muted">
              <th className="px-4 py-3 font-medium">Membro</th>
              <th className="px-4 py-3 font-medium">Vínculo</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Tarefas concluídas</th>
              <th className="px-4 py-3 font-medium">Sinalização de reuso de evidência</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ member, score, flags: memberFlags }) => (
              <tr key={member.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                <td className="px-4 py-3 align-top">{member.fullName}</td>
                <td className="px-4 py-3 align-top">
                  {EMPLOYMENT_TYPE_LABEL[member.employmentType as EmploymentType] ?? member.employmentType}
                </td>
                <td className="px-4 py-3 align-top">
                  {member.status === "active" ? (
                    <StatusPill tone="positive">Ativo</StatusPill>
                  ) : (
                    <StatusPill tone="negative">Desligado</StatusPill>
                  )}
                </td>
                <td className="px-4 py-3 align-top tabular-figures">{score}</td>
                <td className="px-4 py-3 align-top">
                  {memberFlags.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                      <StatusPill tone="warning">
                        {`${memberFlags.length} ${memberFlags.length === 1 ? "sinalização" : "sinalizações"} — revisão humana`}
                      </StatusPill>
                      <ul className="flex flex-col gap-0.5 text-xs text-fg-muted">
                        {memberFlags.map((flag) => (
                          <li key={`${flag.taskId}:${flag.suspectedDuplicateOfTaskId}`}>
                            <code className="rounded bg-surface-2 px-1 py-0.5">{flag.taskId}</code> possível
                            reuso de <code className="rounded bg-surface-2 px-1 py-0.5">{flag.suspectedDuplicateOfTaskId}</code>{" "}
                            (distância {flag.hammingDistance} bit{flag.hammingDistance === 1 ? "" : "s"})
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <StatusPill tone="positive">Sem sinalização</StatusPill>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
