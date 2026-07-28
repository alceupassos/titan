// Editor de checklists versionados (Fase 6, Passo 4c — docs/fase-atual.md, seção 9.8.4 do prompt
// único). Server Component — lista os templates por `serviceType`, destacando a versão vigente e
// o histórico (read-only, nunca editável) de versões anteriores; o formulário de criação de uma
// NOVA versão fica no client component `./ChecklistTemplateEditor.tsx`.
//
// Dados exibidos são AMOSTRA ESTÁTICA (./sample-data.ts) — não há Postgres vivo nesta máquina
// (Docker Desktop parado, "Gap conhecido 2" de docs/fase-atual.md), mesmo padrão de
// apps/console/app/(staff)/fiscal/page.tsx. O CAMINHO DE ESCRITA
// (`createChecklistTemplateVersionAction`, ./actions.ts, chamado por
// ./ChecklistTemplateEditor.tsx) já é real, contra o banco via `withTenant`.
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { ChecklistTemplateEditor } from "./ChecklistTemplateEditor";
import { ALL_SERVICE_TYPES, SAMPLE_CHECKLIST_TEMPLATES, SERVICE_TYPE_LABEL, sectionsOf } from "./sample-data";
import type { checklistTemplates } from "@titan/db";

type ChecklistTemplateRow = typeof checklistTemplates.$inferSelect;

const CIVIL_DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

function formatCivilDate(value: string): string {
  return CIVIL_DATE_FORMATTER.format(new Date(`${value}T00:00:00Z`));
}

export default function ChecklistsPage() {
  const byServiceType = new Map<string, ChecklistTemplateRow[]>();
  for (const template of SAMPLE_CHECKLIST_TEMPLATES) {
    const bucket = byServiceType.get(template.serviceType) ?? [];
    bucket.push(template);
    byServiceType.set(template.serviceType, bucket);
  }

  const serviceTypesWithTemplate = ALL_SERVICE_TYPES.filter((serviceType) => byServiceType.has(serviceType));

  return (
    <div className="p-6">
      <PageHeader
        title="Checklists"
        description="Editor de templates versionados de limpeza. Dados de amostra (sem Postgres vivo nesta máquina; ver docs/fase-atual.md)."
      />

      <div className="mb-8">
        <h2 className="mb-3 text-sm font-medium text-fg-muted">Nova versão de checklist</h2>
        <ChecklistTemplateEditor />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-fg-muted">Templates existentes</h2>
        {serviceTypesWithTemplate.length === 0 ? (
          <EmptyState message="Nenhum template de checklist cadastrado ainda." />
        ) : (
          <div className="flex flex-col gap-6">
            {serviceTypesWithTemplate.map((serviceType) => {
              const versions = [...(byServiceType.get(serviceType) ?? [])].sort((a, b) => b.version - a.version);
              const [current, ...history] = versions;

              return (
                <div key={serviceType} className="rounded-card border border-border bg-surface p-5">
                  <div className="mb-3 flex items-baseline justify-between">
                    <h3 className="text-base font-medium text-fg">{SERVICE_TYPE_LABEL[serviceType]}</h3>
                    <span className="text-xs text-fg-muted">
                      {versions.length} {versions.length === 1 ? "versão" : "versões"}
                    </span>
                  </div>

                  {current ? (
                    <div className="mb-4 rounded-control border border-border bg-bg p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="rounded-pill bg-positive px-2.5 py-0.5 text-xs font-medium text-accent-fg">
                          Vigente — v{current.version}
                        </span>
                        <span className="text-xs text-fg-muted tabular-figures">
                          {formatCivilDate(current.validFrom)} até {formatCivilDate(current.validTo)}
                        </span>
                      </div>
                      <p className="text-xs text-fg-muted">
                        Pontuação mínima: <span className="tabular-figures">{current.passingScore}</span> —{" "}
                        {sectionsOf(current).length} {sectionsOf(current).length === 1 ? "seção" : "seções"},{" "}
                        {sectionsOf(current).reduce((sum, s) => sum + s.items.length, 0)} itens
                      </p>
                    </div>
                  ) : null}

                  {history.length > 0 ? (
                    <div>
                      <p className="mb-2 text-xs font-medium text-fg-muted">Histórico (read-only — nunca editável)</p>
                      <ul className="flex flex-col gap-1.5">
                        {history.map((version) => (
                          <li
                            key={version.id}
                            className="flex items-center justify-between rounded-control border border-border px-3 py-2 text-xs text-fg-muted"
                          >
                            <span>v{version.version}</span>
                            <span className="tabular-figures">
                              {formatCivilDate(version.validFrom)} até {formatCivilDate(version.validTo)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
