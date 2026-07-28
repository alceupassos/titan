import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FiscalDocumentAlreadyStoredError } from "./port";
import { createLocalFileFiscalVault } from "./local-file-vault";

describe("createLocalFileFiscalVault", () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), "titan-fiscal-vault-"));
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it("grava e recupera o conteúdo exato guardado", async () => {
    const vault = createLocalFileFiscalVault({ baseDir });
    const content = Buffer.from("<xml>nota fiscal</xml>", "utf8");

    const ref = await vault.store({ tenantId: "t1", fiscalDocumentId: "doc-1", kind: "xml", content });
    const fetched = await vault.fetch(ref);

    expect(fetched.toString("utf8")).toBe(content.toString("utf8"));
  });

  it("REJEITA um segundo store para a mesma referência — write-once (I7)", async () => {
    const vault = createLocalFileFiscalVault({ baseDir });
    const content = Buffer.from("conteúdo original", "utf8");

    await vault.store({ tenantId: "t1", fiscalDocumentId: "doc-1", kind: "pdf", content });

    await expect(
      vault.store({ tenantId: "t1", fiscalDocumentId: "doc-1", kind: "pdf", content: Buffer.from("tentativa de sobrescrita") }),
    ).rejects.toThrow(FiscalDocumentAlreadyStoredError);
  });

  it("isola por tenant e por tipo (xml vs pdf) — referências distintas", async () => {
    const vault = createLocalFileFiscalVault({ baseDir });
    const xmlRef = await vault.store({ tenantId: "t1", fiscalDocumentId: "doc-1", kind: "xml", content: Buffer.from("xml") });
    const pdfRef = await vault.store({ tenantId: "t1", fiscalDocumentId: "doc-1", kind: "pdf", content: Buffer.from("pdf") });
    const otherTenantRef = await vault.store({ tenantId: "t2", fiscalDocumentId: "doc-1", kind: "xml", content: Buffer.from("outro tenant") });

    expect(xmlRef).not.toBe(pdfRef);
    expect(xmlRef).not.toBe(otherTenantRef);
  });
});
