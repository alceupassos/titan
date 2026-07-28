// Produtividade de campo — redução de escopo deliberada desta fase: `computeProductivityScore` é
// só uma CONTAGEM determinística de tarefas concluídas, não o cálculo de remuneração variável real
// (isso depende de tabela de valor por tipo de tarefa/zona, fora de escopo aqui — mesma disciplina
// de "nunca fabricar percentual/constante" já usada em `../vendor`/`../pricing`). A trava
// anti-gaming reusa `isLikelyReused`/`hammingDistance` de `../evidence/perceptual-hash.ts` em vez
// de recriar detecção de reuso — mesmo average-hash, mesma limitação já documentada lá (não é
// pHash de produção).
import { hammingDistance, isLikelyReused } from "../evidence/perceptual-hash";

export interface TaskCompletionRecord {
  readonly memberId: string;
  readonly taskId: string;
  readonly completedAtEpochMs: number;
  readonly evidenceHashes: readonly string[];
}

/** Contagem simples de tarefas concluídas por membro — heurística determinística, não o cálculo
 * de remuneração variável real (fora de escopo desta fase). */
export function computeProductivityScore(records: readonly TaskCompletionRecord[], memberId: string): number {
  return records.filter((record) => record.memberId === memberId).length;
}

export interface SuspiciousCompletionFlag {
  readonly taskId: string;
  readonly suspectedDuplicateOfTaskId: string;
  readonly hammingDistance: number;
}

/**
 * Sinaliza (nunca bloqueia — mesmo espírito de `enforceAssuranceLevel`: "não bloqueia o
 * trabalho, sinaliza a consequência para revisão humana") possível reuso de foto de evidência
 * entre tarefas concluídas pelo MESMO membro. Decisão de escopo explícita: a comparação é só
 * intra-membro, ordenada por `completedAtEpochMs` — cada registro só é comparado contra os
 * registros ANTERIORES do mesmo `memberId`. Reuso de foto entre membros DIFERENTES não é
 * sinalizado aqui: batem duas explicações legítimas comuns (dois membros documentando a mesma
 * unidade/ocorrência, ou evidência compartilhada legitimamente por um supervisor) que tornariam a
 * sinalização cross-membro majoritariamente ruído; o padrão fraudulento que esta função existe
 * para pegar é "a mesma pessoa reenviando a mesma foto antiga como se fosse de um serviço novo",
 * não fotos idênticas entre pessoas diferentes. Se a extensão cross-membro for necessária no
 * futuro, é uma função nova e explícita, não uma mudança silenciosa desta.
 */
export function flagSuspiciousCompletions(
  records: readonly TaskCompletionRecord[],
  thresholdBits: number,
): SuspiciousCompletionFlag[] {
  const flags: SuspiciousCompletionFlag[] = [];
  const byMember = new Map<string, TaskCompletionRecord[]>();
  for (const record of records) {
    const existing = byMember.get(record.memberId);
    if (existing) {
      existing.push(record);
    } else {
      byMember.set(record.memberId, [record]);
    }
  }

  for (const memberRecords of byMember.values()) {
    const ordered = [...memberRecords].sort((a, b) => a.completedAtEpochMs - b.completedAtEpochMs);

    for (let i = 0; i < ordered.length; i++) {
      const current = ordered[i]!;
      const previous = ordered.slice(0, i);
      const previousHashes = previous.flatMap((record) => record.evidenceHashes);

      for (const candidateHash of current.evidenceHashes) {
        if (isLikelyReused(candidateHash, previousHashes, thresholdBits)) {
          const match = previous.find((record) =>
            record.evidenceHashes.some((hash) => hammingDistance(candidateHash, hash) <= thresholdBits),
          );
          if (match) {
            flags.push({
              taskId: current.taskId,
              suspectedDuplicateOfTaskId: match.taskId,
              hammingDistance: Math.min(
                ...match.evidenceHashes.map((hash) => hammingDistance(candidateHash, hash)),
              ),
            });
          }
        }
      }
    }
  }

  return flags;
}
