// Dados de amostra do painel de Produtividade (Fase 9, Passo 4c — docs/fase-atual.md). Não há
// Postgres vivo nesta máquina (Docker Desktop parado — "Gap conhecido 2"), então esta página
// Server Component não consulta `packages/db` para LER ainda — mesmo padrão de
// ../sample-data.ts/apps/console/app/(staff)/estoque/sample-data.ts. `memberId`s abaixo são os
// MESMOS UUIDs de ../sample-data.ts (nunca ids inventados), para o painel de produtividade ficar
// coerente com as abas de visão geral/escala já existentes.
import type { TaskCompletionRecord } from "@titan/domain";
import { MEMBER_FERNANDA, MEMBER_JULIANA, MEMBER_MARCOS, MEMBER_RICARDO, NOW_ANCHOR_EPOCH_MS } from "../sample-data";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Mesmo limiar usado em packages/domain/src/workforce/productivity.test.ts — average-hash de 64
 * bits (packages/domain/src/evidence/perceptual-hash.ts), limiar baixo/estrito (só pega
 * quase-idênticas), reusado aqui em vez de inventar um valor novo para a amostra. */
export const SAMPLE_SUSPICIOUS_THRESHOLD_BITS = 2;

// Hashes de 64 bits (formato real de `computeAverageHash` — 8x8 = 64 caracteres "0"/"1") —
// construídos por repetição de um padrão de 4 caracteres × 16 = 64, nunca por contagem manual de
// caracteres (fonte comum de erro em string binária longa). Nomeados por "conteúdo" só para
// leitura da amostra, sem nenhum significado além de identificar visualmente qual foto é reusada
// de qual.
const HASH_QUARTO_1 = "1010".repeat(16); // 64 chars
// A 1 bit de distância de HASH_QUARTO_1 (só o primeiro caractere difere) — abaixo do limiar de 2
// bits usado nesta amostra, por isso `flagSuspiciousCompletions` sinaliza o par.
const HASH_QUARTO_1_ALTERNATE_1_BIT = `0${HASH_QUARTO_1.slice(1)}`; // 64 chars
const HASH_BANHEIRO_1 = "0011".repeat(16); // 64 chars
const HASH_COZINHA_1 = "1100".repeat(16); // 64 chars
const HASH_VARANDA_1 = "0101".repeat(16); // 64 chars

/**
 * Histórico de conclusão de tarefa cobrindo os 4 membros de amostra de ../sample-data.ts,
 * incluindo DELIBERADAMENTE um caso de reuso de evidência dentro do MESMO membro (Fernanda:
 * t-fernanda-2 reenvia, para uma unidade/tarefa diferente, um hash a 1 bit de distância do hash já
 * usado em t-fernanda-1 — abaixo do limiar de 2 bits, portanto sinalizado por
 * `flagSuspiciousCompletions`), para a UI de amostra exercitar o caminho de alerta de verdade, não
 * só o caminho feliz.
 */
export const SAMPLE_TASK_COMPLETION_RECORDS: readonly TaskCompletionRecord[] = [
  {
    memberId: MEMBER_FERNANDA,
    taskId: "cleaning-task-fernanda-1",
    completedAtEpochMs: NOW_ANCHOR_EPOCH_MS - 3 * DAY_MS,
    evidenceHashes: [HASH_QUARTO_1],
  },
  {
    // Reuso suspeito: hash a 1 bit de distância do de t-fernanda-1, enviado como evidência de uma
    // tarefa DIFERENTE, dois dias depois — o padrão que `flagSuspiciousCompletions` existe para
    // pegar ("a mesma pessoa reenviando a mesma foto antiga como se fosse de um serviço novo").
    memberId: MEMBER_FERNANDA,
    taskId: "cleaning-task-fernanda-2",
    completedAtEpochMs: NOW_ANCHOR_EPOCH_MS - 1 * DAY_MS,
    evidenceHashes: [HASH_QUARTO_1_ALTERNATE_1_BIT],
  },
  {
    memberId: MEMBER_FERNANDA,
    taskId: "cleaning-task-fernanda-3",
    completedAtEpochMs: NOW_ANCHOR_EPOCH_MS,
    evidenceHashes: [HASH_BANHEIRO_1],
  },
  {
    memberId: MEMBER_RICARDO,
    taskId: "work-order-ricardo-1",
    completedAtEpochMs: NOW_ANCHOR_EPOCH_MS - 2 * DAY_MS,
    evidenceHashes: [HASH_COZINHA_1],
  },
  {
    memberId: MEMBER_RICARDO,
    taskId: "work-order-ricardo-2",
    completedAtEpochMs: NOW_ANCHOR_EPOCH_MS,
    evidenceHashes: [HASH_VARANDA_1],
  },
  {
    memberId: MEMBER_JULIANA,
    taskId: "inspection-juliana-1",
    completedAtEpochMs: NOW_ANCHOR_EPOCH_MS - 1 * DAY_MS,
    evidenceHashes: [HASH_QUARTO_1, HASH_BANHEIRO_1],
  },
  {
    // Marcos está desligado (status "dismissed" em ../sample-data.ts) mas mantém histórico de
    // conclusões anteriores ao desligamento — o histórico nunca é apagado (mesma disciplina de
    // append-only já usada para evidence_log/ledger_entries).
    memberId: MEMBER_MARCOS,
    taskId: "cleaning-task-marcos-1",
    completedAtEpochMs: NOW_ANCHOR_EPOCH_MS - 10 * DAY_MS,
    evidenceHashes: [HASH_COZINHA_1],
  },
];
