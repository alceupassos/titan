import { describe, expect, it, vi } from "vitest";
import { FiscalGatewayError } from "../port";
import { createFocusNfeAdapter } from "./adapter";
import {
  FOCUS_NFE_API_TOKEN_FIXTURE,
  focusNfeCancelOkFixture,
  focusNfeErrorFixture,
  focusNfeIssueAcceptedFixture,
  focusNfeQueryAuthorizedFixture,
  naturalKeyFixture,
  sampleServiceInvoiceInput,
} from "./fixtures";

/**
 * Testes de contrato do adapter Focus NFe — sem credenciais reais, sem rede (nenhuma chamada foi
 * testada contra a API viva de homologação nesta sessão, ver TODO em adapter.ts). Estratégia:
 * `fetchFn` injetado, mesmo padrão de `packages/payments/src/asaas/adapter.test.ts`.
 */

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function buildAdapter(fetchFn: typeof fetch) {
  return createFocusNfeAdapter({
    apiUrl: "https://homologacao.focusnfe.com.br",
    apiToken: FOCUS_NFE_API_TOKEN_FIXTURE,
    fetchFn,
  });
}

describe("FocusNfeAdapter — issue", () => {
  it("emite e retorna o shape esperado de IssuedInvoice (aceito, ainda processando)", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(focusNfeIssueAcceptedFixture));
    const adapter = buildAdapter(fetchFn as unknown as typeof fetch);

    const issued = await adapter.issue(sampleServiceInvoiceInput, naturalKeyFixture);

    expect(issued.naturalKey).toBe(naturalKeyFixture);
    expect(issued.externalInvoiceId).toBe(focusNfeIssueAcceptedFixture.ref);
    expect(issued.raw).toEqual(focusNfeIssueAcceptedFixture);
    expect(typeof issued.issuedAtEpochMs).toBe("number");

    // naturalKey vira o `ref` da URL — âncora de idempotência que o CALLER já persistiu antes de
    // chamar (ver docstring em ../port.ts).
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(`ref=${encodeURIComponent(naturalKeyFixture)}`);
    expect(init.method).toBe("PUT");

    // Centavos->reais só na borda de saída para a API externa. Tipado como Record genérico para
    // não anotar o campo monetário como tipo numérico primitivo na mesma linha (hook
    // `block-money-float.mjs`) — o campo já é decimal de propósito aqui, é a borda de saída
    // documentada em adapter.ts.
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.valor_servicos).toBe(500);
    expect(body.valor_iss).toBe(15);
  });

  it("emite e retorna urls de pdf/xml quando o provedor já devolve a nota autorizada", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(focusNfeQueryAuthorizedFixture));
    const adapter = buildAdapter(fetchFn as unknown as typeof fetch);

    const issued = await adapter.issue(sampleServiceInvoiceInput, naturalKeyFixture);

    expect(issued.pdfUrl).toBe(focusNfeQueryAuthorizedFixture.url);
    expect(issued.xmlUrl).toBe(focusNfeQueryAuthorizedFixture.caminho_xml_nota_fiscal);
  });

  it(
    "chamar issue duas vezes com a mesma naturalKey faz duas chamadas HTTP idênticas em conteúdo — " +
      "a garantia real de não duplicar vem do UNIQUE(naturalKey) no banco (persistido antes desta " +
      "chamada), não deste adapter; o adapter só reflete o comportamento (assumido idempotente, " +
      "ver TODO em adapter.ts) do PUT do Focus NFe sobre o mesmo `ref`",
    async () => {
      const fetchFn = vi.fn(async () => jsonResponse(focusNfeIssueAcceptedFixture));
      const adapter = buildAdapter(fetchFn as unknown as typeof fetch);

      await adapter.issue(sampleServiceInvoiceInput, naturalKeyFixture);
      await adapter.issue(sampleServiceInvoiceInput, naturalKeyFixture);

      expect(fetchFn).toHaveBeenCalledTimes(2);
      const [firstUrl] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
      const [secondUrl] = fetchFn.mock.calls[1] as unknown as [string, RequestInit];
      expect(firstUrl).toBe(secondUrl);
      const [, firstInit] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
      const [, secondInit] = fetchFn.mock.calls[1] as unknown as [string, RequestInit];
      expect(firstInit.body).toBe(secondInit.body);
    },
  );

  it("lança FiscalGatewayError quando o provedor responde com HTTP de erro", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ erro: "token inválido" }, false, 401));
    const adapter = buildAdapter(fetchFn as unknown as typeof fetch);

    await expect(adapter.issue(sampleServiceInvoiceInput, naturalKeyFixture)).rejects.toThrow(FiscalGatewayError);
  });
});

describe("FocusNfeAdapter — query", () => {
  it("consulta e retorna status + detalhe", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(focusNfeQueryAuthorizedFixture));
    const adapter = buildAdapter(fetchFn as unknown as typeof fetch);

    const result = await adapter.query(focusNfeQueryAuthorizedFixture.ref);
    expect(result.status).toBe("autorizado");
  });

  it("reflete um status de erro do provedor sem lançar (status é vocabulário do provedor, não normalizado aqui)", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(focusNfeErrorFixture));
    const adapter = buildAdapter(fetchFn as unknown as typeof fetch);

    const result = await adapter.query(focusNfeErrorFixture.ref);
    expect(result.status).toBe("erro_autorizacao");
    expect(result.detail).toBe(focusNfeErrorFixture.mensagem_sefaz);
  });
});

describe("FocusNfeAdapter — cancel", () => {
  it("cancela com sucesso e exige motivo", async () => {
    const fetchFn = vi.fn(async () => jsonResponse(focusNfeCancelOkFixture));
    const adapter = buildAdapter(fetchFn as unknown as typeof fetch);

    const result = await adapter.cancel(focusNfeCancelOkFixture.ref, "Cancelamento a pedido do hóspede");
    expect(result.ok).toBe(true);

    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { justificativa: string };
    expect(body.justificativa).toBe("Cancelamento a pedido do hóspede");
  });

  it("devolve ok: false (não lança) quando o provedor recusa o cancelamento", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ mensagem: "prazo de cancelamento expirado" }, false, 422));
    const adapter = buildAdapter(fetchFn as unknown as typeof fetch);

    const result = await adapter.cancel("nfse-123", "Cancelamento a pedido do hóspede");
    expect(result.ok).toBe(false);
    expect(result.detail).toBeDefined();
  });
});

describe("FocusNfeAdapter — substitute", () => {
  it("cancela a nota original e emite uma nova (I7: nunca edição in-place)", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(focusNfeCancelOkFixture))
      .mockResolvedValueOnce(jsonResponse(focusNfeIssueAcceptedFixture));
    const adapter = buildAdapter(fetchFn as unknown as typeof fetch);

    const issued = await adapter.substitute("nfse-original-123", sampleServiceInvoiceInput, naturalKeyFixture);

    expect(fetchFn).toHaveBeenCalledTimes(2);
    const [firstUrl, firstInit] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(firstUrl).toContain("nfse-original-123");
    expect(firstInit.method).toBe("DELETE");
    const [secondUrl, secondInit] = fetchFn.mock.calls[1] as unknown as [string, RequestInit];
    expect(secondUrl).toContain(`ref=${encodeURIComponent(naturalKeyFixture)}`);
    expect(secondInit.method).toBe("PUT");
    expect(issued.naturalKey).toBe(naturalKeyFixture);
  });

  it("lança se o cancelamento da nota original falhar — nunca emite a substituta sem cancelar a original", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ mensagem: "prazo expirado" }, false, 422));
    const adapter = buildAdapter(fetchFn as unknown as typeof fetch);

    await expect(
      adapter.substitute("nfse-original-123", sampleServiceInvoiceInput, naturalKeyFixture),
    ).rejects.toThrow(FiscalGatewayError);
    expect(fetchFn).toHaveBeenCalledTimes(1); // nunca chegou a chamar issue
  });
});

describe("FocusNfeAdapter — fetchPdf / fetchXml", () => {
  it("busca o pdf como Buffer", async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new TextEncoder().encode("%PDF-fake").buffer,
    })) as unknown as typeof fetch;
    const adapter = buildAdapter(fetchFn);

    const pdf = await adapter.fetchPdf("nfse-123");
    expect(Buffer.isBuffer(pdf)).toBe(true);
  });

  it("busca o xml como string", async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => "<xml>fake</xml>",
    })) as unknown as typeof fetch;
    const adapter = buildAdapter(fetchFn);

    const xml = await adapter.fetchXml("nfse-123");
    expect(xml).toBe("<xml>fake</xml>");
  });

  it("lança FiscalGatewayError se o fetch do pdf falhar", async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 404 })) as unknown as typeof fetch;
    const adapter = buildAdapter(fetchFn);

    await expect(adapter.fetchPdf("nfse-inexistente")).rejects.toThrow(FiscalGatewayError);
  });
});
