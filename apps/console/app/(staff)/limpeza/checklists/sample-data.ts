// Dados de amostra para o editor de checklists (Fase 6, Passo 4c — docs/fase-atual.md). NÃO há
// Postgres vivo nesta máquina (Docker Desktop parado — "Gap conhecido 2" de docs/fase-atual.md),
// então esta rota não consulta `packages/db` para LER. Mesmo espírito de
// apps/console/app/(staff)/fiscal/sample-data.ts: o tipo aqui é o MESMO tipo de linha crua do
// Drizzle (`typeof checklistTemplates.$inferSelect`), não uma interface solta reinventada —
// trocar por uma query real (`withTenant(...).select().from(checklistTemplates)...`) é só trocar
// a fonte dos dados, nunca o formato consumido pela página/pelo client component.
//
// O CAMINHO DE ESCRITA (`createChecklistTemplateVersionAction` — ./actions.ts) é real, contra o
// banco via `withTenant` — chamar a partir desta amostra tenta o Postgres de verdade e, sem
// Docker rodando, falha com erro de conexão (mesmo comportamento hoje de outras rotas do cockpit).
//
// Determinístico de propósito (sem `Date.now()`) — mesma âncora de tempo usada em
// apps/console/app/(staff)/fiscal/sample-data.ts, para o preview renderizar sempre igual.
import type { checklistTemplates } from "@titan/db";

const TENANT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a00"; // mesmo tenant de amostra das outras rotas.

type ChecklistTemplateRow = typeof checklistTemplates.$inferSelect;

// A coluna `sections` é `jsonb` no Drizzle (packages/db/src/schema/checklist-template.ts) —
// tipada como `unknown` na linha crua, sem `$type<...>()`. Este shape espelha
// `ChecklistSection`/`ChecklistItem` de packages/domain/src/housekeeping/checklist.ts para quem
// consome a amostra (./page.tsx, ./ChecklistTemplateEditor.tsx) sem precisar depender desse
// pacote em runtime — mesmo espírito do schema Zod local em ./actions.ts.
export interface ChecklistItemJson {
  id: string;
  label: string;
  weight: number;
  blocking: boolean;
  type: "photo" | "confirm" | "numeric" | "select" | "text" | "scan" | "timer" | "signature";
  expectedSeconds?: number;
}

export interface ChecklistSectionJson {
  id: string;
  title: string;
  items: ChecklistItemJson[];
}

/** Cast explícito e único ponto de acesso à coluna jsonb `sections` — ver comentário acima sobre
 * por que ela chega como `unknown` na linha crua do Drizzle. */
export function sectionsOf(template: ChecklistTemplateRow): ChecklistSectionJson[] {
  return template.sections as ChecklistSectionJson[];
}

// Duas versões do MESMO serviceType (limpeza_saida) — v1 vigência encerrada, v2 vigente hoje.
// Prova visual de que versão antiga nunca é editada/apagada, só sucedida por uma linha nova
// (packages/domain/src/housekeeping/checklist.ts, cabeçalho: "nova versão é linha nova").
export const SAMPLE_CHECKLIST_TEMPLATES: readonly ChecklistTemplateRow[] = [
  {
    id: "t0000000-0000-4000-8000-000000000001",
    tenantId: TENANT_ID,
    version: 1,
    serviceType: "limpeza_saida",
    sections: [
      {
        id: "sec-quarto",
        title: "Quarto",
        items: [
          { id: "item-cama-feita", label: "Cama feita com enxoval limpo", weight: 2, blocking: true, type: "photo" },
          { id: "item-lixeira-vazia", label: "Lixeira esvaziada", weight: 1, blocking: false, type: "confirm" },
        ],
      },
      {
        id: "sec-banheiro",
        title: "Banheiro",
        items: [
          { id: "item-banheiro-limpo", label: "Box e vaso sanitário limpos", weight: 2, blocking: true, type: "photo" },
        ],
      },
    ],
    passingScore: 80,
    validFrom: "2026-01-01",
    validTo: "2026-06-30",
  },
  {
    id: "t0000000-0000-4000-8000-000000000002",
    tenantId: TENANT_ID,
    version: 2,
    serviceType: "limpeza_saida",
    sections: [
      {
        id: "sec-quarto",
        title: "Quarto",
        items: [
          { id: "item-cama-feita", label: "Cama feita com enxoval limpo", weight: 2, blocking: true, type: "photo" },
          { id: "item-lixeira-vazia", label: "Lixeira esvaziada", weight: 1, blocking: false, type: "confirm" },
          { id: "item-ar-condicionado", label: "Ar-condicionado testado (liga/resfria)", weight: 1, blocking: false, type: "confirm" },
        ],
      },
      {
        id: "sec-banheiro",
        title: "Banheiro",
        items: [
          { id: "item-banheiro-limpo", label: "Box e vaso sanitário limpos", weight: 2, blocking: true, type: "photo" },
          { id: "item-amenities", label: "Amenities repostos", weight: 1, blocking: false, type: "photo" },
        ],
      },
      {
        id: "sec-cozinha",
        title: "Cozinha",
        items: [
          { id: "item-louca-guardada", label: "Louça lavada e guardada", weight: 1, blocking: false, type: "confirm" },
        ],
      },
    ],
    passingScore: 85,
    validFrom: "2026-07-01",
    validTo: "2999-12-31",
  },
  {
    id: "t0000000-0000-4000-8000-000000000003",
    tenantId: TENANT_ID,
    version: 1,
    serviceType: "dedetizacao",
    sections: [
      {
        id: "sec-aplicacao",
        title: "Aplicação",
        items: [
          { id: "item-produto-registrado", label: "Registro do produto aplicado (nome/lote)", weight: 2, blocking: true, type: "text" },
          { id: "item-tempo-carencia", label: "Tempo de carência informado ao hóspede seguinte", weight: 1, blocking: true, type: "confirm" },
        ],
      },
    ],
    passingScore: 100,
    validFrom: "2026-01-01",
    validTo: "2999-12-31",
  },
  {
    id: "t0000000-0000-4000-8000-000000000004",
    tenantId: TENANT_ID,
    version: 1,
    serviceType: "piscina",
    sections: [
      {
        id: "sec-quimica",
        title: "Química da água",
        items: [
          { id: "item-ph", label: "pH medido (6.8–7.6)", weight: 2, blocking: true, type: "numeric" },
          { id: "item-cloro", label: "Cloro residual medido", weight: 2, blocking: true, type: "numeric" },
        ],
      },
    ],
    passingScore: 90,
    validFrom: "2026-01-01",
    validTo: "2999-12-31",
  },
];

// Os 10 valores de ServiceType (packages/domain/src/housekeeping/checklist.ts) — usados para
// listar TODO tipo de serviço no formulário/agrupamento, mesmo o que ainda não tem template
// cadastrado na amostra acima (ex.: "vistoria", "estofado").
export const ALL_SERVICE_TYPES = [
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
] as const;

export const SERVICE_TYPE_LABEL: Record<(typeof ALL_SERVICE_TYPES)[number], string> = {
  limpeza_saida: "Limpeza de saída",
  limpeza_intermediaria: "Limpeza intermediária",
  limpeza_profunda: "Limpeza profunda",
  dedetizacao: "Dedetização",
  ar_condicionado: "Ar-condicionado",
  piscina: "Piscina",
  estofado: "Estofado",
  jardinagem: "Jardinagem",
  manutencao_corretiva: "Manutenção corretiva",
  vistoria: "Vistoria",
};
