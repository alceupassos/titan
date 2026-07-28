"use client";

// Detalhe do prestador (Fase 7, Passo 4b) — perfil (regime + compliance), histórico de OS
// concluídas com nota e fila de contas a pagar pendentes com pagamento (retenção calculada no
// servidor). Client component porque cada seção tem estado próprio de formulário/transição —
// mesmo padrão de apps/console/app/(staff)/financeiro/AccountsPayableList.tsx. Os dados recebidos
// via props são AMOSTRA ESTÁTICA (../sample-data.ts); as ações chamadas (`updateVendorProfileAction`/
// `rateVendorAfterWorkOrderAction`/`payVendorInvoiceAction`, ../actions.ts) são as Server Actions
// reais, contra o banco.
import { useState, useTransition } from "react";
import {
  calculateVendorRetentionAmountsCents,
  NoVendorRetentionRuleForRegimeError,
  OverlappingVendorRetentionRuleValidityError,
  resolveVendorRetentionRuleForDate,
  type Cents,
  type VendorRetentionAmounts,
  type VendorRetentionRule,
} from "@titan/domain";
import { civilDate } from "@titan/dates";
import { StatusPill, type StatusTone } from "@titan/ui";
import { format, money } from "@titan/money";
import {
  payVendorInvoiceAction,
  rateVendorAfterWorkOrderAction,
  updateVendorProfileAction,
} from "../actions";
import type {
  SampleVendorAccountsPayable,
  SampleVendorProfile,
  SampleVendorRetentionRule,
  SampleVendorWorkOrder,
  VendorComplianceStatusSample,
  VendorTaxRegimeSample,
} from "../sample-data";

const TAX_REGIME_LABEL: Record<VendorTaxRegimeSample, string> = {
  pj_cessao_mao_obra: "PJ — cessão de mão de obra",
  pj_simples: "PJ — Simples Nacional",
  pf_autonomo: "PF — autônomo",
};

const COMPLIANCE_LABEL: Record<VendorComplianceStatusSample, string> = {
  pending: "Pendente",
  compliant: "Conforme",
  non_compliant: "Não conforme",
};

const COMPLIANCE_TONE: Record<VendorComplianceStatusSample, StatusTone> = {
  pending: "warning",
  compliant: "positive",
  non_compliant: "negative",
};

function formatRating(basisPoints: number | undefined): string {
  if (basisPoints === undefined) return "Sem avaliação";
  return `${(basisPoints / 100).toFixed(2).replace(".", ",")} ★`;
}

function toDomainRetentionRule(rule: SampleVendorRetentionRule): VendorRetentionRule {
  return {
    id: rule.id,
    tenantId: "sample",
    taxRegime: rule.taxRegime,
    inssBasisPoints: rule.inssBasisPoints,
    irrfBasisPoints: rule.irrfBasisPoints,
    csrfBasisPoints: rule.csrfBasisPoints,
    issBasisPoints: rule.issBasisPoints,
    validFrom: civilDate(rule.validFrom),
    validTo: civilDate(rule.validTo),
  };
}

/** Prévia client-side da retenção — SÓ PARA EXIBIÇÃO antes de confirmar o pagamento. O valor
 * REALMENTE gravado é sempre o que `payVendorInvoiceAction` recalcula no servidor a partir da
 * `vendor_retention_rules` vigente no banco (regra dura do CLAUDE.md raiz: preço/retenção nunca
 * aceitos do cliente) — esta função usa a MESMA lógica pura de domínio
 * (`resolveVendorRetentionRuleForDate`/`calculateVendorRetentionAmountsCents`, zero I/O) só para a
 * amostra local, e pode divergir do resultado real se as regras cadastradas no Postgres forem
 * diferentes das regras de amostra. */
function previewRetention(
  amountCents: Cents,
  taxRegime: VendorTaxRegimeSample,
  rules: readonly SampleVendorRetentionRule[],
): { kind: "ok"; retention: VendorRetentionAmounts } | { kind: "error"; message: string } {
  try {
    const domainRules = rules.filter((r) => r.taxRegime === taxRegime).map(toDomainRetentionRule);
    const today = civilDate(new Date().toISOString().slice(0, 10));
    const rule = resolveVendorRetentionRuleForDate(domainRules, { taxRegime, date: today });
    return { kind: "ok", retention: calculateVendorRetentionAmountsCents(amountCents, rule) };
  } catch (err) {
    if (
      err instanceof NoVendorRetentionRuleForRegimeError ||
      err instanceof OverlappingVendorRetentionRuleValidityError
    ) {
      return { kind: "error", message: err.message };
    }
    return { kind: "error", message: "Falha ao calcular prévia de retenção." };
  }
}

export interface VendorDetailProps {
  vendor: SampleVendorProfile;
  pendingAccountsPayable: readonly SampleVendorAccountsPayable[];
  workOrders: readonly SampleVendorWorkOrder[];
  retentionRules: readonly SampleVendorRetentionRule[];
}

export function VendorDetail({ vendor, pendingAccountsPayable, workOrders, retentionRules }: VendorDetailProps) {
  const [isPending, startTransition] = useTransition();

  // Formulário de perfil.
  const [taxRegime, setTaxRegime] = useState<VendorTaxRegimeSample>(vendor.taxRegime ?? "pj_simples");
  const [complianceStatus, setComplianceStatus] = useState<VendorComplianceStatusSample>(vendor.complianceStatus);
  const [profileError, setProfileError] = useState<string | undefined>(undefined);
  const [profileSuccess, setProfileSuccess] = useState<string | undefined>(undefined);

  // Formulário de avaliação (workOrderId + nota 0-5).
  const [rateWorkOrderId, setRateWorkOrderId] = useState("");
  const [ratingInput, setRatingInput] = useState("5");
  const [rateError, setRateError] = useState<string | undefined>(undefined);
  const [rateSuccess, setRateSuccess] = useState<string | undefined>(undefined);

  // Estado por conta a pagar (pagamento).
  const [apState, setApState] = useState<Record<string, { paid: boolean; error: string | undefined }>>({});

  function handleProfileSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    setProfileError(undefined);
    setProfileSuccess(undefined);
    startTransition(async () => {
      const result = await updateVendorProfileAction({ vendorId: vendor.id, taxRegime, complianceStatus });
      if (result.ok) {
        setProfileSuccess("Cadastro atualizado.");
      } else {
        setProfileError(result.error);
      }
    });
  }

  function handleRateSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    setRateError(undefined);
    setRateSuccess(undefined);

    const rating = Number.parseFloat(ratingInput);
    if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
      setRateError("Nota precisa ser um número entre 0 e 5.");
      return;
    }
    if (rateWorkOrderId.trim().length === 0) {
      setRateError("Informe o id da OS concluída (status \"paid\").");
      return;
    }

    startTransition(async () => {
      const result = await rateVendorAfterWorkOrderAction({
        workOrderId: rateWorkOrderId.trim(),
        vendorId: vendor.id,
        rating,
      });
      if (result.ok) {
        setRateSuccess(
          `Avaliação registrada — nova média: ${formatRating(result.data.ratingAvgBasisPoints)} (${result.data.ratingCount} nota(s)).`,
        );
        setRateWorkOrderId("");
      } else {
        setRateError(result.error);
      }
    });
  }

  function handlePay(item: SampleVendorAccountsPayable): void {
    setApState((prev) => ({ ...prev, [item.id]: { paid: prev[item.id]?.paid ?? false, error: undefined } }));
    startTransition(async () => {
      const result = await payVendorInvoiceAction({ accountsPayableId: item.id });
      if (result.ok) {
        setApState((prev) => ({ ...prev, [item.id]: { paid: true, error: undefined } }));
      } else {
        setApState((prev) => ({ ...prev, [item.id]: { paid: false, error: result.error } }));
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold text-fg">Perfil</h2>
          <StatusPill tone={COMPLIANCE_TONE[vendor.complianceStatus]}>
            {COMPLIANCE_LABEL[vendor.complianceStatus]}
          </StatusPill>
          <span className="text-sm text-fg-muted">
            {vendor.document} · {vendor.category}
          </span>
          <span className="tabular-figures text-sm text-fg-muted">{formatRating(vendor.ratingAvgBasisPoints)}</span>
        </div>

        <form onSubmit={handleProfileSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            Regime de tributação
            <select
              value={taxRegime}
              onChange={(e) => setTaxRegime(e.target.value as VendorTaxRegimeSample)}
              className="rounded-control border border-border bg-bg p-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              {(Object.keys(TAX_REGIME_LABEL) as VendorTaxRegimeSample[]).map((regime) => (
                <option key={regime} value={regime}>
                  {TAX_REGIME_LABEL[regime]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            Status de compliance
            <select
              value={complianceStatus}
              onChange={(e) => setComplianceStatus(e.target.value as VendorComplianceStatusSample)}
              className="rounded-control border border-border bg-bg p-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              {(Object.keys(COMPLIANCE_LABEL) as VendorComplianceStatusSample[]).map((status) => (
                <option key={status} value={status}>
                  {COMPLIANCE_LABEL[status]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-3">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-control bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-colors duration-100 hover:bg-accent/90 disabled:opacity-50"
            >
              Salvar cadastro
            </button>
          </div>
          {profileError ? <p className="text-xs text-negative sm:col-span-3">{profileError}</p> : null}
          {profileSuccess ? <p className="text-xs text-positive sm:col-span-3">{profileSuccess}</p> : null}
        </form>
      </section>

      <section className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold text-fg">Ordens de serviço concluídas</h2>
        <ul className="flex flex-col gap-2">
          {workOrders.length === 0 ? (
            <li className="text-sm text-fg-muted">Nenhuma OS concluída ainda.</li>
          ) : (
            workOrders.map((wo) => (
              <li
                key={wo.id}
                className="flex items-center justify-between gap-3 rounded-control border border-border px-3 py-2 text-sm"
              >
                <span className="text-fg-muted">{wo.description}</span>
                <span className="tabular-figures text-fg">
                  {wo.status === "rated" ? formatRating((wo.rating ?? 0) * 100) : "Aguardando avaliação"}
                </span>
              </li>
            ))
          )}
        </ul>

        <form onSubmit={handleRateSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs text-fg-muted sm:col-span-2">
            Id da OS (status &quot;paid&quot;)
            <input
              value={rateWorkOrderId}
              onChange={(e) => setRateWorkOrderId(e.target.value)}
              placeholder="uuid da ordem de serviço"
              className="rounded-control border border-border bg-bg p-2 text-sm text-fg placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            Nota (0-5)
            <input
              inputMode="decimal"
              value={ratingInput}
              onChange={(e) => setRatingInput(e.target.value)}
              className="rounded-control border border-border bg-bg p-2 text-sm tabular-figures text-fg focus-visible:outline-2 focus-visible:outline-accent"
            />
          </label>
          <div className="flex items-center gap-3 sm:col-span-3">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-control bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-colors duration-100 hover:bg-accent/90 disabled:opacity-50"
            >
              Avaliar OS
            </button>
            {rateError ? <p className="text-xs text-negative">{rateError}</p> : null}
            {rateSuccess ? <p className="text-xs text-positive">{rateSuccess}</p> : null}
          </div>
        </form>
      </section>

      <section className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold text-fg">Contas a pagar pendentes</h2>
        {pendingAccountsPayable.length === 0 ? (
          <p className="text-sm text-fg-muted">Nenhuma conta a pagar pendente para este prestador.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pendingAccountsPayable.map((item) => {
              const state = apState[item.id];
              const isPaid = state?.paid === true;
              const preview =
                !isPaid && vendor.taxRegime
                  ? previewRetention(item.amountCents, vendor.taxRegime, retentionRules)
                  : undefined;

              return (
                <li key={item.id} className="rounded-control border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-fg">{item.description}</p>
                      <p className="tabular-figures text-sm text-fg-muted">
                        {format(money(item.amountCents, item.currency))} — vencimento {item.dueDateISO}
                      </p>
                    </div>
                    {isPaid ? (
                      <StatusPill tone="positive">Paga</StatusPill>
                    ) : !vendor.taxRegime ? (
                      <StatusPill tone="warning">Cadastre o regime fiscal antes de pagar</StatusPill>
                    ) : (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handlePay(item)}
                        className="rounded-control bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg transition-colors duration-100 hover:bg-accent/90 disabled:opacity-50"
                      >
                        Pagar
                      </button>
                    )}
                  </div>

                  {!isPaid && preview ? (
                    <div className="mt-3 rounded-control bg-surface-2 p-3 text-xs text-fg-muted">
                      <p className="mb-1 font-medium text-fg-muted">
                        Prévia de retenção (calculada de novo pelo servidor ao confirmar):
                      </p>
                      {preview.kind === "error" ? (
                        <p className="text-negative">{preview.message}</p>
                      ) : (
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                          <div>
                            <dt>INSS</dt>
                            <dd className="tabular-figures text-fg">
                              {format(money(preview.retention.inssCents, item.currency))}
                            </dd>
                          </div>
                          <div>
                            <dt>IRRF</dt>
                            <dd className="tabular-figures text-fg">
                              {format(money(preview.retention.irrfCents, item.currency))}
                            </dd>
                          </div>
                          <div>
                            <dt>CSRF</dt>
                            <dd className="tabular-figures text-fg">
                              {format(money(preview.retention.csrfCents, item.currency))}
                            </dd>
                          </div>
                          <div>
                            <dt>ISS</dt>
                            <dd className="tabular-figures text-fg">
                              {format(money(preview.retention.issCents, item.currency))}
                            </dd>
                          </div>
                          <div>
                            <dt>Líquido</dt>
                            <dd className="tabular-figures font-medium text-fg">
                              {format(money(preview.retention.netCents, item.currency))}
                            </dd>
                          </div>
                        </dl>
                      )}
                    </div>
                  ) : null}

                  {state?.error ? <p className="mt-2 text-xs text-negative">{state.error}</p> : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
