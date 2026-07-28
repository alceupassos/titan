// Shapes espelhando o vocabulário de packages/contracts/src/housekeeping.ts e
// packages/domain/src/housekeeping/checklist.ts — este app NÃO importa esses pacotes (puxariam
// dependências Node-only/Next para o bundle Expo), então os tipos são redeclarados aqui,
// sincronizados manualmente (mesmo princípio já usado em packages/contracts vs. packages/domain
// em todas as fases anteriores: fonte de validação separada do domínio).

export interface FieldTask {
  readonly taskId: string;
  readonly unitId: string;
  readonly unitName: string;
  readonly checklistItems: readonly ChecklistItemSummary[];
}

export interface ChecklistItemSummary {
  readonly itemId: string;
  readonly label: string;
  readonly requiresPhoto: boolean;
}

// Espelha EvidenceEnvelopeSchema de packages/contracts/src/housekeeping.ts.
export interface EvidenceEnvelope {
  readonly contentHash: string;
  readonly capturedAtEpochMs: number;
  readonly deviceId: string;
  readonly appVersion: string;
  readonly taskId: string;
  readonly checklistItemId: string;
  readonly unitId: string;
  readonly room: string;
  readonly geo: { lat: number; lng: number; accuracy: number } | null;
  readonly referenceShotId: string | null;
}

// Os 10 valores de ServiceType — packages/domain/src/housekeeping/checklist.ts.
export const SERVICE_TYPES = [
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
export type ServiceType = (typeof SERVICE_TYPES)[number];
