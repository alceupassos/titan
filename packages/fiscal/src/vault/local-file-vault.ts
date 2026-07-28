// Implementação de DESENVOLVIMENTO do cofre fiscal (Fase 4, Passo 5) — grava em disco local,
// tenta marcar o arquivo como somente-leitura (`chmod 0o444`, best-effort — falha silenciosa em
// sistemas de arquivo que não suportam, ex. algumas configurações de rede/Windows). **ISTO NÃO É
// WORM DE VERDADE**: um processo com permissão suficiente ainda pode apagar/sobrescrever o
// arquivo no disco. Serve só para ambiente de desenvolvimento local (sem bucket S3-compatível
// com Object Lock provisionado nesta máquina — mesma limitação de infra do Gap conhecido 1 da
// Fase 0). Produção real EXIGE um adapter contra um provedor com WORM/Object Lock de verdade
// (S3 Object Lock em modo Compliance, ou equivalente) antes de qualquer emissão fiscal real —
// documentado aqui, não implementado nesta sessão por falta de credenciais/bucket reais.
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  FiscalDocumentAlreadyStoredError,
  type FiscalStorageRef,
  type FiscalVault,
  type StoreFiscalDocumentParams,
} from "./port";

export interface LocalFileFiscalVaultConfig {
  readonly baseDir: string;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export function createLocalFileFiscalVault(config: LocalFileFiscalVaultConfig): FiscalVault {
  function refFor(params: Pick<StoreFiscalDocumentParams, "tenantId" | "fiscalDocumentId" | "kind">): FiscalStorageRef {
    return join(config.baseDir, params.tenantId, `${params.fiscalDocumentId}.${params.kind}`);
  }

  return {
    async store(params) {
      const ref = refFor(params);
      if (await fileExists(ref)) {
        throw new FiscalDocumentAlreadyStoredError(ref);
      }
      await mkdir(join(config.baseDir, params.tenantId), { recursive: true });
      await writeFile(ref, params.content);
      try {
        await chmod(ref, 0o444); // best-effort — não é WORM real, ver comentário no topo do arquivo.
      } catch {
        // Sistema de arquivo não suporta chmod (ex. algumas montagens de rede) — segue sem essa
        // proteção adicional; a garantia real de imutabilidade fiscal é I7 no domínio, não isto.
      }
      return ref;
    },

    async fetch(ref) {
      return readFile(ref);
    },
  };
}
