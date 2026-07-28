// Fase 6, Passo 4a — barrel de packages/evidence. Escopo desta fase: porta de captura de
// evidência (recálculo de hash de conteúdo, verificação de assinatura HMAC, flag de desvio de
// relógio), decodificação mínima para luminância/average-hash, e ancoragem diária placeholder
// (NÃO RFC 3161 real — ver `anchor.ts`). Reexporta os tipos/erros necessários para a borda HTTP
// real (fora de escopo deste passo) montar a rota de upload de captura.

export {
  recomputeContentHash,
  assertContentHashMatches,
  ContentHashMismatchError,
  verifyCaptureSignature,
  ClockDriftFlag,
  detectClockDrift,
} from "./capture-verification";

export {
  computeAverageHashFromImageBytes,
  InvalidLuminanceBufferError,
} from "./luminance";

export {
  computeDailyRoot,
  anchorDailyRootLocally,
} from "./anchor";
export type { DailyRootAnchor, HashFn } from "./anchor";
