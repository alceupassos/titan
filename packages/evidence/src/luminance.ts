// Fase 6, Passo 4a — decodificação de imagem para luminância, alimentando `computeAverageHash` de
// `@titan/domain` (que já espera exatamente 64 valores 0-255 em ordem row-major 8x8 — ver
// `packages/domain/src/evidence/perceptual-hash.ts`).
//
// DECISÃO DE ESCOPO (documentada, não escondida): esta sessão NÃO adiciona `sharp`/`jimp` (ou
// qualquer lib de decodificação de imagem) como dependência de `packages/evidence`. Motivo: ambas
// são dependências nativas (binário compilado por plataforma) que nunca foram instaladas nem
// testadas neste monorepo nesta sessão — adicionar "às cegas" e fingir que a decodificação real de
// JPEG/PNG capturado pela câmera do navegador funciona seria exatamente o tipo de otimismo que a
// seção 8 do prompt único pede para evitar ("o agente errará por otimismo se estas limitações não
// estiverem escritas").
//
// Em vez disso, este arquivo implementa o decodificador MÍNIMO possível: aceita um `Buffer` que
// já É a grade de luminância 8x8 pré-calculada — 64 bytes crus, um por pixel, valor 0-255,
// row-major, sem header e sem compressão. É um "formato simples" no sentido mais literal.
//
// Isso significa que a decodificação real de JPEG/PNG (redimensionar para 8x8, converter para
// escala de cinza, extrair luminância) CONTINUA sendo responsabilidade de uma lib de imagem real
// — a ser escolhida e testada contra bytes de imagem verdadeiros em sessão futura, antes que este
// pacote possa aceitar upload de JPEG/PNG bruto do navegador. Até lá, o caminho esperado é: a
// borda HTTP (rota de upload de captura) decodifica com essa lib futura e só então chama
// `computeAverageHashFromImageBytes` já com os 64 bytes de luminância — nunca com o JPEG/PNG cru.
// TODO: trocar por decodificação real (sharp ou equivalente) quando essa lib for adicionada e
// testada nesta máquina.

import { computeAverageHash } from "@titan/domain";

const EXPECTED_BYTE_COUNT = 64;

export class InvalidLuminanceBufferError extends RangeError {
  constructor(actualLength: number) {
    super(
      `computeAverageHashFromImageBytes espera exatamente ${EXPECTED_BYTE_COUNT} bytes (grade de ` +
        "luminância 8x8 pré-calculada, row-major, 0-255 cada) — recebeu " +
        `${actualLength} bytes. Decodificação real de JPEG/PNG não está implementada nesta fase ` +
        "(ver cabeçalho deste arquivo) — o caller precisa decodificar a imagem antes de chamar.",
    );
    this.name = "InvalidLuminanceBufferError";
  }
}

/**
 * Função pública que a borda chama: recebe um `Buffer` de 64 bytes (luminância 8x8 já
 * pré-calculada pelo caller, ver cabeçalho deste arquivo) e retorna o average-hash de 64 bits via
 * `computeAverageHash` de `@titan/domain`. Síncrona — não há nenhuma decodificação assíncrona real
 * acontecendo aqui, dada a decisão de escopo documentada acima (sem lib de imagem nesta sessão).
 */
export function computeAverageHashFromImageBytes(imageBytes: Buffer): string {
  if (imageBytes.length !== EXPECTED_BYTE_COUNT) {
    throw new InvalidLuminanceBufferError(imageBytes.length);
  }
  const luminance = Array.from(imageBytes.values());
  return computeAverageHash(luminance);
}
