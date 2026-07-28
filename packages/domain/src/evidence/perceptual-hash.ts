// Seção 9.8.2 do prompt único — detecção de foto reutilizada ("mesma foto de uma virada anterior
// apresentada como se fosse da atual"). Decisão de escopo da Fase 6: isto é um AVERAGE-HASH
// simples (8x8 = 64 bits) — MENOS robusto que um pHash (DCT) ou dHash (gradiente) de produção,
// que resistem melhor a pequenas variações de compressão/brilho/recorte. Um average-hash é
// suficiente para pegar o caso ingênuo (mesmíssima foto reenviada) e é trivial de implementar sem
// nenhuma dependência de processamento de imagem — mas não finge ser a coisa real; se reuso mais
// sofisticado (crop leve, watermark, recompressão agressiva) precisar ser detectado, isso é
// trabalho de um pacote de borda com uma lib de imagem de verdade, não deste arquivo.
//
// Zero I/O: a decodificação de bytes de imagem para luminância é responsabilidade da borda
// (`packages/evidence`, fora de escopo aqui) — este arquivo só recebe os 64 valores já
// decodificados e normalizados.

const HASH_SIZE = 8;
const EXPECTED_PIXEL_COUNT = HASH_SIZE * HASH_SIZE; // 64

export class InvalidLuminanceArrayError extends RangeError {
  constructor(actualLength: number) {
    super(
      `computeAverageHash espera exatamente ${EXPECTED_PIXEL_COUNT} valores de luminância ` +
        `(grade 8x8, row-major), recebeu ${actualLength} — nunca processa um array de tamanho ` +
        "errado silenciosamente.",
    );
    this.name = "InvalidLuminanceArrayError";
  }
}

export class HashLengthMismatchError extends RangeError {
  constructor(lengthA: number, lengthB: number) {
    super(
      `hammingDistance exige dois hashes do mesmo tamanho — recebeu ${lengthA} e ${lengthB} bits.`,
    );
    this.name = "HashLengthMismatchError";
  }
}

/**
 * Average-hash (aHash) de 64 bits: recebe exatamente 64 valores de luminância (0-255, já em
 * ordem row-major 8x8), calcula a média, produz uma string binária de 64 caracteres — "1" se o
 * pixel está acima (ou igual) da média, "0" caso contrário. Lança `InvalidLuminanceArrayError`
 * se o array não tiver exatamente 64 elementos.
 */
export function computeAverageHash(luminance: readonly number[]): string {
  if (luminance.length !== EXPECTED_PIXEL_COUNT) {
    throw new InvalidLuminanceArrayError(luminance.length);
  }

  const average = luminance.reduce((sum, value) => sum + value, 0) / EXPECTED_PIXEL_COUNT;
  return luminance.map((value) => (value >= average ? "1" : "0")).join("");
}

/** Conta bits diferentes entre dois hashes binários do mesmo tamanho (distância de Hamming). */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) {
    throw new HashLengthMismatchError(a.length, b.length);
  }

  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) distance++;
  }
  return distance;
}

/**
 * Uma foto candidata é provavelmente reuso de alguma foto recente se a distância de Hamming
 * contra QUALQUER hash recente for <= `thresholdBits`. Não existe default escondido: o chamador
 * sempre informa o limiar explicitamente. Um valor comum para average-hash de 64 bits em
 * detecção de "mesmíssima foto" é um limiar baixo (5-10 bits de diferença) — quanto menor, mais
 * estrito (só pega quase-idênticas); quanto maior, mais permissivo (pega também variações
 * pequenas de compressão/brilho), documentado aqui só como referência para quem for escolher o
 * valor na borda, não como constante usada por esta função.
 */
export function isLikelyReused(
  candidateHash: string,
  recentHashes: readonly string[],
  thresholdBits: number,
): boolean {
  return recentHashes.some((recent) => hammingDistance(candidateHash, recent) <= thresholdBits);
}
