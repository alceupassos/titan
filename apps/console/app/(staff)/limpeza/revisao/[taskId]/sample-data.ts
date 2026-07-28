// Dados de amostra do painel de revisão fotográfica (Fase 6, Passo 4d — docs/fase-atual.md).
// Mesmo padrão de apps/console/app/(staff)/aprovacoes/sample-data.ts e .../fiscal/sample-data.ts:
// não há Postgres vivo nesta máquina (Docker Desktop parado — Gap conhecido 2), então ./page.tsx
// cai para este arquivo quando a leitura real (./queries.ts::getCleaningTaskReview) falha ou não
// encontra a linha. O CAMINHO DE ESCRITA (`decideReviewAction`, ./actions.ts) é sempre real, contra
// o banco via `withTenant` — clicar em decidir aqui tenta o Postgres de verdade e, sem Docker
// rodando, falha com erro de conexão (mesmo comportamento já documentado nas fases anteriores).
//
// Determinístico de propósito para os timestamps ILUSTRATIVOS (início da tarefa, captura de cada
// foto) — âncora fixa, mesmo espírito das outras rotas desta fase, para que o preview renderize
// sempre igual. EXCEÇÃO deliberada: o PRAZO DE SINISTRO (`claimDeadline.info.deadlineEpochMs`) é
// calculado a partir de `Date.now()` no momento em que este módulo é avaliado, não da âncora fixa
// — um prazo fixo em época passada relativa ao dia real em que a página é aberta acabaria virando
// "vencido" (ou deixando de estar "em risco") dependendo de quando esta sessão específica rodar,
// o que quebraria a garantia de que os dois estados (`TASK_A1_SUFICIENTE` folgado,
// `TASK_PRAZO_EM_RISCO` dentro da janela de aviso) sempre aparecem como pretendido no preview.
//
// Três estados cobertos, exatamente os que a seção 9.9/9.8.7 exige demonstrar:
// 1. `TASK_A1_SUFICIENTE`: evidência A1 ativa (não descartada) — suficiente para liberar a
//    unidade (mínimo exigido por `MINIMUM_ASSURANCE_BY_CONSEQUENCE.release_ready`, A1). Prazo de
//    sinistro confortável (não em risco).
// 2. `TASK_PRAZO_EM_RISCO`: evidência A2 (também suficiente para liberar), mas o prazo de
//    sinistro do canal está DENTRO da janela de aviso — `isClaimDeadlineAtRisk` deve retornar
//    `true` para este caso.
// 3. `TASK_EVIDENCIA_INSUFICIENTE`: a única captura ativa está em A0 (abaixo do mínimo) — mostra
//    o bloqueio real de `enforceAssuranceLevel` na hora de decidir "aprovar" (a Server Action
//    recusa liberar a unidade mesmo que o revisor clique aprovar).
import type { CleaningTaskReview } from "./queries";

const ANCHOR_EPOCH_MS = Date.parse("2026-07-28T09:00:00Z");
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const TASK_A1_SUFICIENTE = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b01";
export const TASK_PRAZO_EM_RISCO = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b02";
export const TASK_EVIDENCIA_INSUFICIENTE = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b03";

export const DEFAULT_SAMPLE_TASK_ID = TASK_A1_SUFICIENTE;

export const SAMPLE_CLEANING_TASK_REVIEWS: Readonly<Record<string, CleaningTaskReview>> = {
  [TASK_A1_SUFICIENTE]: {
    cleaningTaskId: TASK_A1_SUFICIENTE,
    unitId: "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380c01",
    assignedTo: "Fernanda Oliveira",
    status: "clean",
    startedAtEpochMs: ANCHOR_EPOCH_MS - 3 * HOUR_MS,
    evidence: [
      {
        entryHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b8a",
        contentHash: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
        assuranceLevel: "A1",
        room: "Quarto 1",
        capturedAtEpochMs: ANCHOR_EPOCH_MS - 2 * HOUR_MS,
        discarded: false,
      },
      {
        entryHash: "6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b",
        contentHash: "d4735e3a265e16eee03f59718b9b5d03019c07d8b6c51f90da3a666eec13ab35",
        assuranceLevel: "A1",
        room: "Banheiro",
        capturedAtEpochMs: ANCHOR_EPOCH_MS - 2 * HOUR_MS + 5 * 60 * 1000,
        discarded: false,
      },
    ],
    claimDeadline: {
      kind: "resolved",
      info: {
        channel: "direct",
        deadlineEpochMs: Date.now() + 20 * DAY_MS,
        ruleId: "d4eebc99-9c0b-4ef8-bb6d-6bb9bd380d01",
      },
    },
  },
  [TASK_PRAZO_EM_RISCO]: {
    cleaningTaskId: TASK_PRAZO_EM_RISCO,
    unitId: "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380c02",
    assignedTo: "Rogério Alves",
    status: "clean",
    startedAtEpochMs: ANCHOR_EPOCH_MS - 5 * HOUR_MS,
    evidence: [
      {
        entryHash: "4e07408562bedb8b60ce05c1decfe3ad16b72230967de01f640b7e4729b49fce",
        contentHash: "4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a",
        assuranceLevel: "A2",
        room: "Sala",
        capturedAtEpochMs: ANCHOR_EPOCH_MS - 4 * HOUR_MS,
        discarded: false,
      },
    ],
    claimDeadline: {
      kind: "resolved",
      info: {
        // Dentro da janela de aviso (isClaimDeadlineAtRisk) — ainda não vencido, mas perto.
        channel: "booking",
        deadlineEpochMs: Date.now() + 6 * HOUR_MS,
        ruleId: "d4eebc99-9c0b-4ef8-bb6d-6bb9bd380d02",
      },
    },
  },
  [TASK_EVIDENCIA_INSUFICIENTE]: {
    cleaningTaskId: TASK_EVIDENCIA_INSUFICIENTE,
    unitId: "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380c03",
    assignedTo: "Juliana Costa",
    status: "clean",
    startedAtEpochMs: ANCHOR_EPOCH_MS - 1 * HOUR_MS,
    evidence: [
      {
        entryHash: "ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d",
        contentHash: "1f0e3dad99908345f7439f8ffabdffc4e2ed4b0c5aae08d0eb1e0ce9f4bf7f83c",
        assuranceLevel: "A0",
        room: "Cozinha",
        capturedAtEpochMs: ANCHOR_EPOCH_MS - 50 * 60 * 1000,
        discarded: false,
      },
    ],
    claimDeadline: { kind: "no-reservation" },
  },
};
