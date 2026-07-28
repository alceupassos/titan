"use client";

// Painel de escala + custódia de acesso por membro (Fase 9, Passo 4b). Client component porque
// tem estado próprio (respostas de escala, formulários de emitir/transferir credencial,
// desligamento) — mesmo padrão de apps/console/app/(staff)/estoque/StockBalanceTable.tsx e
// .../limpeza/CleaningBoard.tsx. Os dados recebidos via props são AMOSTRA ESTÁTICA
// (../sample-data.ts, combinada em ./page.tsx); as ações chamadas (../actions.ts) são as Server
// Actions reais, contra o banco via `withTenant`.
import { useState, useTransition } from "react";
import { StatusPill, type StatusTone } from "@titan/ui";
import {
  assignShiftAction,
  dismissMemberAction,
  issueAccessCredentialAction,
  respondToShiftAssignmentAction,
  transferAccessCredentialAction,
} from "../actions";

export type EmploymentTypeSample = "employee" | "contractor" | "unspecified";
export type AssignmentModeSample = "mandatory" | "voluntary";
export type ShiftStatusSample = "proposed" | "accepted" | "declined" | "completed";
export type AccessCredentialTypeSample = "physical_key" | "digital_code" | "app_access";

export interface MemberBoardShift {
  id: string;
  date: string; // CivilDate ("YYYY-MM-DD")
  status: ShiftStatusSample;
}

export interface MemberBoardCredential {
  credentialType: AccessCredentialTypeSample;
  credentialId: string;
}

export interface MemberBoardRow {
  memberId: string;
  fullName: string;
  role: string;
  employmentType: EmploymentTypeSample;
  /** Resolvido via `resolveAssignmentMode` (packages/domain/src/workforce/assignment.ts) em
   * ./page.tsx — nunca recalculado aqui, para não duplicar a regra de negócio na UI. */
  assignmentMode: AssignmentModeSample;
  shifts: readonly MemberBoardShift[];
  activeCredentials: readonly MemberBoardCredential[];
}

export interface MemberOption {
  id: string;
  fullName: string;
  status: "active" | "dismissed";
}

const EMPLOYMENT_LABEL: Record<EmploymentTypeSample, string> = {
  employee: "CLT (employee)",
  contractor: "PJ (contractor)",
  unspecified: "Vínculo não confirmado",
};

const SHIFT_STATUS_LABEL: Record<ShiftStatusSample, string> = {
  proposed: "Aguardando resposta",
  accepted: "Aceita",
  declined: "Recusada",
  completed: "Concluída",
};

const SHIFT_STATUS_TONE: Record<ShiftStatusSample, StatusTone> = {
  proposed: "warning",
  accepted: "positive",
  declined: "negative",
  completed: "info",
};

const CREDENTIAL_TYPE_LABEL: Record<AccessCredentialTypeSample, string> = {
  physical_key: "Chave física",
  digital_code: "Código digital",
  app_access: "Acesso de app",
};

/** `date` é sempre "YYYY-MM-DD" (CivilDate) — parse manual em vez de `new Date(iso)` evita o
 * deslocamento de fuso clássico (meia-noite UTC lida como o dia anterior em fusos negativos),
 * mesma disciplina de docs/anti-padroes.md #9. */
function formatCivilDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

interface RowFormState {
  issueType: AccessCredentialTypeSample;
  issueId: string;
  transferTargetId: string;
  newShiftDate: string;
  dismissReason: string;
  showDismissForm: boolean;
  message: string | undefined;
  error: string | undefined;
}

function emptyRowForm(): RowFormState {
  return {
    issueType: "app_access",
    issueId: "",
    transferTargetId: "",
    newShiftDate: "",
    dismissReason: "",
    showDismissForm: false,
    message: undefined,
    error: undefined,
  };
}

export interface ScheduleAccessBoardProps {
  rows: readonly MemberBoardRow[];
  memberOptions: readonly MemberOption[];
}

export function ScheduleAccessBoard({ rows, memberOptions }: ScheduleAccessBoardProps) {
  const [forms, setForms] = useState<Record<string, RowFormState>>(() =>
    Object.fromEntries(rows.map((row) => [row.memberId, emptyRowForm()])),
  );
  const [isPending, startTransition] = useTransition();

  function formFor(memberId: string): RowFormState {
    return forms[memberId] ?? emptyRowForm();
  }

  function patchForm(memberId: string, partial: Partial<RowFormState>): void {
    setForms((prev) => ({ ...prev, [memberId]: { ...(prev[memberId] ?? emptyRowForm()), ...partial } }));
  }

  function assignNewShift(memberId: string): void {
    const form = formFor(memberId);
    if (!form.newShiftDate) {
      patchForm(memberId, { error: "Selecione uma data.", message: undefined });
      return;
    }
    startTransition(async () => {
      const result = await assignShiftAction({ memberId, date: form.newShiftDate });
      if (result.ok) {
        patchForm(memberId, {
          message: `Escala atribuída (${form.newShiftDate}) — status inicial "${result.data.status}".`,
          error: undefined,
          newShiftDate: "",
        });
      } else {
        patchForm(memberId, { error: result.error, message: undefined });
      }
    });
  }

  function respond(shiftAssignmentId: string, memberId: string, response: "accepted" | "declined"): void {
    startTransition(async () => {
      const result = await respondToShiftAssignmentAction({ shiftAssignmentId, response });
      if (result.ok) {
        patchForm(memberId, { message: `Escala atualizada para "${result.data.status}".`, error: undefined });
      } else {
        patchForm(memberId, { error: result.error, message: undefined });
      }
    });
  }

  function issueCredential(memberId: string): void {
    const form = formFor(memberId);
    if (!form.issueId.trim()) {
      patchForm(memberId, { error: "Informe o identificador da credencial.", message: undefined });
      return;
    }
    startTransition(async () => {
      const result = await issueAccessCredentialAction({
        memberId,
        credentialType: form.issueType,
        credentialId: form.issueId.trim(),
      });
      if (result.ok) {
        patchForm(memberId, {
          message: `Credencial "${result.data.credentialId}" emitida.`,
          error: undefined,
          issueId: "",
        });
      } else {
        patchForm(memberId, { error: result.error, message: undefined });
      }
    });
  }

  function transferCredential(memberId: string, credentialId: string): void {
    const form = formFor(memberId);
    if (!form.transferTargetId) {
      patchForm(memberId, { error: "Selecione o membro de destino.", message: undefined });
      return;
    }
    startTransition(async () => {
      const result = await transferAccessCredentialAction({
        credentialId,
        fromMemberId: memberId,
        toMemberId: form.transferTargetId,
      });
      if (result.ok) {
        patchForm(memberId, {
          message: `Credencial "${result.data.credentialId}" transferida.`,
          error: undefined,
          transferTargetId: "",
        });
      } else {
        patchForm(memberId, { error: result.error, message: undefined });
      }
    });
  }

  function dismiss(memberId: string): void {
    const form = formFor(memberId);
    if (!form.dismissReason.trim()) {
      patchForm(memberId, { error: "Motivo do desligamento é obrigatório.", message: undefined });
      return;
    }
    startTransition(async () => {
      const result = await dismissMemberAction({ memberId, reason: form.dismissReason.trim() });
      if (result.ok) {
        patchForm(memberId, {
          message: `Membro desligado — ${result.data.revokedCount} credencial(is) revogada(s).`,
          error: undefined,
          showDismissForm: false,
          dismissReason: "",
        });
      } else {
        patchForm(memberId, { error: result.error, message: undefined });
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {rows.map((row) => {
        const form = formFor(row.memberId);
        return (
          <div key={row.memberId} className="rounded-card border border-border bg-surface p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-medium text-fg">{row.fullName}</h3>
                <p className="text-xs text-fg-muted">
                  {row.role} · {EMPLOYMENT_LABEL[row.employmentType]} ·{" "}
                  {row.assignmentMode === "mandatory"
                    ? "Escala obrigatória (sem aceite a fazer)"
                    : "Escala por oferta (sujeita a aceite/recusa)"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => patchForm(row.memberId, { showDismissForm: !form.showDismissForm })}
                className="rounded-control border border-border px-3 py-1 text-xs font-medium text-negative transition-colors duration-100 hover:bg-surface-2"
              >
                Desligar
              </button>
            </div>

            {form.showDismissForm ? (
              <div className="mb-3 rounded-control border border-negative/40 bg-surface-2 p-3">
                <label htmlFor={`dismiss-reason-${row.memberId}`} className="text-label text-fg-muted">
                  Motivo do desligamento (obrigatório — nunca desligamento silencioso)
                </label>
                <textarea
                  id={`dismiss-reason-${row.memberId}`}
                  value={form.dismissReason}
                  onChange={(e) => patchForm(row.memberId, { dismissReason: e.target.value })}
                  rows={2}
                  className="mt-1 w-full rounded-control border border-border bg-bg p-2 text-xs text-fg focus-visible:outline-2 focus-visible:outline-accent"
                />
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => dismiss(row.memberId)}
                  className="mt-2 rounded-control bg-negative px-3 py-1.5 text-xs font-medium text-fg transition-colors duration-100 hover:bg-negative/90 disabled:opacity-50"
                >
                  Confirmar desligamento (revoga toda credencial ativa)
                </button>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <h4 className="mb-2 text-xs font-medium text-fg-muted">Escala</h4>
                {row.shifts.length === 0 ? (
                  <p className="mb-2 text-xs text-fg-muted">Sem escala atribuída nesta amostra.</p>
                ) : (
                  <ul className="mb-2 flex flex-col gap-2">
                    {row.shifts.map((shift) => (
                      <li key={shift.id} className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="tabular-figures text-fg">{formatCivilDate(shift.date)}</span>
                        <StatusPill tone={SHIFT_STATUS_TONE[shift.status]}>{SHIFT_STATUS_LABEL[shift.status]}</StatusPill>
                        {/* Aceitar/recusar só aparece para escala `voluntary` ainda `proposed` —
                            `mandatory` (employee) é só exibição, nunca oferece recusa (seção
                            9.10.6: subordinação de fato indevida é risco trabalhista real). */}
                        {row.assignmentMode === "voluntary" && shift.status === "proposed" ? (
                          <span className="flex gap-1">
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => respond(shift.id, row.memberId, "accepted")}
                              className="rounded-control border border-border px-2 py-0.5 text-xs hover:bg-surface-2 disabled:opacity-50"
                            >
                              Aceitar
                            </button>
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => respond(shift.id, row.memberId, "declined")}
                              className="rounded-control border border-border px-2 py-0.5 text-xs hover:bg-surface-2 disabled:opacity-50"
                            >
                              Recusar
                            </button>
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`new-shift-${row.memberId}`} className="text-label text-fg-muted">
                      Nova escala
                    </label>
                    <input
                      id={`new-shift-${row.memberId}`}
                      type="date"
                      value={form.newShiftDate}
                      onChange={(e) => patchForm(row.memberId, { newShiftDate: e.target.value })}
                      className="rounded-control border border-border bg-bg p-1.5 text-xs text-fg focus-visible:outline-2 focus-visible:outline-accent"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => assignNewShift(row.memberId)}
                    className="rounded-control border border-border px-3 py-1.5 text-xs font-medium text-fg transition-colors duration-100 hover:bg-surface-2 disabled:opacity-50"
                  >
                    Atribuir
                  </button>
                </div>
              </div>

              <div>
                <h4 className="mb-2 text-xs font-medium text-fg-muted">Custódia de acesso</h4>
                {row.activeCredentials.length === 0 ? (
                  <p className="mb-2 text-xs text-fg-muted">Nenhuma credencial ativa nesta amostra.</p>
                ) : (
                  <ul className="mb-2 flex flex-col gap-2">
                    {row.activeCredentials.map((credential) => (
                      <li key={credential.credentialId} className="flex flex-wrap items-center gap-2 text-xs">
                        <StatusPill tone="positive">Ativa</StatusPill>
                        <span className="text-fg">
                          {CREDENTIAL_TYPE_LABEL[credential.credentialType]} — {credential.credentialId}
                        </span>
                        <select
                          value={form.transferTargetId}
                          onChange={(e) => patchForm(row.memberId, { transferTargetId: e.target.value })}
                          className="rounded-control border border-border bg-bg p-1 text-xs text-fg"
                        >
                          <option value="">Transferir para…</option>
                          {memberOptions
                            .filter((option) => option.id !== row.memberId && option.status === "active")
                            .map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.fullName}
                              </option>
                            ))}
                        </select>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => transferCredential(row.memberId, credential.credentialId)}
                          className="rounded-control border border-border px-2 py-0.5 text-xs hover:bg-surface-2 disabled:opacity-50"
                        >
                          Transferir
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex flex-wrap items-end gap-2">
                  <select
                    value={form.issueType}
                    onChange={(e) =>
                      patchForm(row.memberId, { issueType: e.target.value as AccessCredentialTypeSample })
                    }
                    className="rounded-control border border-border bg-bg p-1.5 text-xs text-fg"
                  >
                    {(Object.keys(CREDENTIAL_TYPE_LABEL) as AccessCredentialTypeSample[]).map((type) => (
                      <option key={type} value={type}>
                        {CREDENTIAL_TYPE_LABEL[type]}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Identificador da credencial"
                    value={form.issueId}
                    onChange={(e) => patchForm(row.memberId, { issueId: e.target.value })}
                    className="rounded-control border border-border bg-bg p-1.5 text-xs text-fg focus-visible:outline-2 focus-visible:outline-accent"
                  />
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => issueCredential(row.memberId)}
                    className="rounded-control bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg transition-colors duration-100 hover:bg-accent/90 disabled:opacity-50"
                  >
                    Emitir credencial
                  </button>
                </div>
              </div>
            </div>

            {form.error ? <p className="mt-3 text-xs text-negative">{form.error}</p> : null}
            {form.message ? <p className="mt-3 text-xs text-positive">{form.message}</p> : null}
          </div>
        );
      })}
    </div>
  );
}
