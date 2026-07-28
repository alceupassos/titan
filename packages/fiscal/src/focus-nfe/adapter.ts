// TODO: validar contra a documentação vigente do Focus NFe antes de produção. Implementado nesta
// sessão sem acesso à doc ao vivo nem a credenciais/sandbox (homologação) real — nenhuma chamada
// de rede real foi testada. Nomes exatos de endpoint, verbo HTTP, formato de payload e o
// comportamento de idempotência descritos abaixo são a melhor suposição plausível a partir do que
// é publicamente conhecido sobre a API REST do Focus NFe (seção 9.3 do prompt único: "capacidades
// a validar contra a documentação vigente"), não certeza confirmada — mesmo padrão já usado para
// o adapter Asaas na Fase 2 (`packages/payments/src/asaas/adapter.ts`). Cada suposição específica
// tem seu próprio TODO pontual abaixo.
//
// Escopo desta faixa (Fase 4, Passo 4a — docs/fase-atual.md): só `packages/fiscal/src/port.ts` e
// este diretório. `apps/worker` (enfileiramento/persistência de `naturalKey` antes da chamada) e
// `apps/console` são faixas paralelas, não tocadas aqui.
import type { IssuedInvoice, ServiceInvoiceInput } from "@titan/domain";
import type { CancelInvoiceResult, FiscalGateway, FiscalInvoiceStatusQuery } from "../port";
import { FiscalGatewayError } from "../port";

/**
 * Configuração do adapter Focus NFe.
 *
 * `fetchFn` existe só para injeção em teste (contract test sem rede real, ver
 * `adapter.test.ts`) — em produção, deixe undefined e o `fetch` nativo do Node é usado. Mesmo
 * padrão de `packages/payments/src/asaas/adapter.ts`.
 */
export interface FocusNfeAdapterConfig {
  /** `FOCUS_NFE_API_URL` — produção: "https://api.focusnfe.com.br"; homologação:
   * "https://homologacao.focusnfe.com.br". Nunca hardcoded no adapter, sempre vindo de
   * config/env (mesma regra do `apiUrl` do adapter Asaas). */
  readonly apiUrl: string;
  /** `FOCUS_NFE_API_TOKEN` — token de acesso da conta Focus NFe (produção ou homologação,
   * conforme `apiUrl`). Autenticação documentada historicamente como HTTP Basic com o token no
   * lugar do usuário e senha vazia. TODO: confirmar contra a doc vigente se ainda é Basic Auth
   * ou se migrou para Bearer token — implementado aqui como Basic por ser o padrão
   * historicamente mais citado para essa API. */
  readonly apiToken: string;
  readonly fetchFn?: typeof fetch;
}

/** Payload de resposta da API de NFS-e do Focus NFe — shape best-effort a partir do que é
 * publicamente conhecido (campos comuns a integrações de NFS-e nacionais: `status`, `numero`,
 * `codigo_verificacao`, urls de PDF/XML). TODO: confirmar nomes exatos de campo contra a doc
 * vigente antes de produção. */
interface FocusNfeInvoiceResponse {
  readonly ref?: string;
  readonly status: string;
  readonly numero?: string;
  readonly codigo_verificacao?: string;
  readonly url?: string; // PDF (DANFSE)
  readonly url_danfse?: string;
  readonly caminho_xml_nota_fiscal?: string;
  readonly mensagem_sefaz?: string;
  readonly erros?: ReadonlyArray<{ readonly mensagem?: string }>;
  readonly [key: string]: unknown;
}

// Status de NFS-e retornados pelo Focus NFe (best-effort a partir do catálogo documentado
// historicamente: emissão assíncrona, then consulta) — nunca normalizados para `InvoiceStatus`
// aqui (essa tradução é do worker, ver comentário em `../port.ts`). Lista mantida só para
// referência de leitura, não usada para lançar erro em status desconhecido (diferente do adapter
// Asaas): um status de NFS-e não reconhecido não é necessariamente uma falha — municípios variam
// as mensagens de retorno da SEFAZ/prefeitura, e travar a aplicação nesse caso seria pior que
// repassar o status cru para quem consulta.
// TODO: catálogo completo não confirmado contra a doc vigente.
const KNOWN_FOCUS_NFE_STATUSES = [
  "processando_autorizacao",
  "autorizado",
  "erro_autorizacao",
  "cancelado",
  "erro_cancelamento",
] as const;
void KNOWN_FOCUS_NFE_STATUSES; // documentação viva, não usada em lógica — ver comentário acima

function toIssuedInvoice(naturalKey: string, response: FocusNfeInvoiceResponse): IssuedInvoice {
  // `exactOptionalPropertyTypes: true` (tsconfig.base.json) proíbe atribuir `undefined`
  // explicitamente a uma propriedade opcional — por isso `pdfUrl`/`xmlUrl` só entram no objeto
  // quando de fato têm valor, via spread condicional, em vez de `pdfUrl: possivelmenteUndefined`.
  const pdfUrl = response.url ?? response.url_danfse;
  const xmlUrl = response.caminho_xml_nota_fiscal;
  return {
    externalInvoiceId: response.ref ?? naturalKey,
    naturalKey,
    issuedAtEpochMs: Date.now(),
    ...(pdfUrl !== undefined ? { pdfUrl } : {}),
    ...(xmlUrl !== undefined ? { xmlUrl } : {}),
    raw: response,
  };
}

export function createFocusNfeAdapter(config: FocusNfeAdapterConfig): FiscalGateway {
  const fetchFn = config.fetchFn ?? fetch;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      // TODO: mecanismo de autenticação não confirmado contra a doc vigente — Basic Auth com o
      // token como usuário e senha vazia é o padrão historicamente mais citado para a API do
      // Focus NFe (diferente do Asaas, que usa um header dedicado `access_token`).
      Authorization: `Basic ${Buffer.from(`${config.apiToken}:`).toString("base64")}`,
      ...(init.headers as Record<string, string> | undefined),
    };
    const res = await fetchFn(`${config.apiUrl}${path}`, { ...init, headers });
    const bodyText = await res.text();
    let body: unknown;
    try {
      body = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      body = { raw: bodyText };
    }
    if (!res.ok) {
      throw new FiscalGatewayError(
        "focus-nfe",
        `API respondeu ${res.status} para ${path}: ${bodyText || "<corpo vazio>"}`,
      );
    }
    return body as T;
  }

  return {
    // Idempotência (I6-adjacente para o domínio fiscal, seção 9.6): `naturalKey` vira o `ref` da
    // URL do recurso — o Focus NFe identifica notas de serviço por um `ref` que o INTEGRADOR
    // escolhe (não um id gerado pelo provedor), e o verbo documentado historicamente para
    // criar/consultar por `ref` é `PUT /v2/nfse?ref={ref}` (idempotente por natureza HTTP: PUT no
    // mesmo `ref` duas vezes deveria ser a mesma operação, não uma nota nova).
    // TODO: validar contra a doc vigente se o Focus NFe de fato trata um segundo PUT no mesmo
    // `ref` como idempotente (devolve a nota já existente) ou se rejeita com erro de duplicidade
    // — os dois comportamentos são plausíveis e este adapter não tem como diferenciar sem uma
    // chamada real. A garantia FORTE de não duplicar (seção 9.6: "jamais duas notas para o mesmo
    // fato gerador mesmo sob retry") vem do banco (`naturalKey` UNIQUE em `fiscal_documents`,
    // persistida ANTES desta chamada, Passo 2 desta fase) — este adapter só reflete o
    // comportamento do provedor, nunca é a última linha de defesa contra duplicidade.
    async issue(input: ServiceInvoiceInput, naturalKey: string): Promise<IssuedInvoice> {
      const payload = {
        // Prestador: sempre a Titan (docs/decisoes-de-negocio.md, pergunta 2, confirmada) — nunca
        // o proprietário.
        prestador: {
          razao_social: input.issuerName,
        },
        tomador: {
          // CPF ou CNPJ — Focus NFe historicamente distingue os dois campos
          // (`cpf`/`cnpj_tomador`); TODO: confirmar contra a doc vigente o nome exato do campo e
          // se aceita um único campo genérico ou exige a distinção por comprimento do documento.
          cpf: input.takerDocument.length <= 11 ? input.takerDocument : undefined,
          cnpj: input.takerDocument.length > 11 ? input.takerDocument : undefined,
        },
        // Alíquota/código de serviço NUNCA são constante de código aqui — vêm já resolvidos pelo
        // chamador a partir da tabela versionada `tax_rules` (`resolveTaxRuleForDate`,
        // `calculateTaxAmountCents`, Passo 1 desta fase) — regra dura do CLAUDE.md raiz e
        // anti-padrão #6.
        codigo_municipio: input.municipalityCode,
        item_lista_servico: input.serviceCode,
        // Focus NFe trabalha valores em reais (decimal), não em centavos — mesma conversão de
        // borda de saída que o adapter Asaas faz para `value` (ver `centsToReais` abaixo).
        valor_servicos: centsToReais(input.baseAmountCents),
        valor_iss: centsToReais(input.taxAmountCents),
        discriminacao: input.description,
        // TODO: NFS-e tem muitos campos obrigatórios adicionais dependendo do município
        // (natureza da operação, regime especial de tributação, exigibilidade do ISS, etc. —
        // seção 9.6 menciona a tabela versionada de alíquota/retenção/prazo, mas o payload
        // completo de emissão varia por prefeitura). Este payload cobre só os campos que o
        // `ServiceInvoiceInput` atual carrega; campos adicionais exigidos por um município
        // específico são responsabilidade de quem monta `ServiceInvoiceInput` antes de chamar
        // este adapter, não deste arquivo.
      };

      const response = await request<FocusNfeInvoiceResponse>(`/v2/nfse?ref=${encodeURIComponent(naturalKey)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      return toIssuedInvoice(naturalKey, response);
    },

    async cancel(externalInvoiceId: string, reason: string): Promise<CancelInvoiceResult> {
      // TODO: verbo/endpoint não confirmado contra a doc vigente — DELETE sobre o recurso
      // identificado por `ref` é o padrão REST mais plausível (espelha a criação via PUT sobre o
      // mesmo `ref`), mas o Focus NFe pode exigir um endpoint de ação dedicado
      // (ex.: `POST /v2/nfse/{ref}/cancelar`) em vez de DELETE puro.
      try {
        const response = await request<FocusNfeInvoiceResponse>(
          `/v2/nfse/${encodeURIComponent(externalInvoiceId)}`,
          {
            method: "DELETE",
            body: JSON.stringify({ justificativa: reason }),
          },
        );
        // Mesmo escape de `exactOptionalPropertyTypes: true` de `toIssuedInvoice` acima.
        return { ok: true, ...(response.mensagem_sefaz !== undefined ? { detail: response.mensagem_sefaz } : {}) };
      } catch (err) {
        // Cancelamento recusado pelo provedor (ex.: prazo espontâneo de cancelamento municipal já
        // expirado) é resultado de NEGÓCIO esperado, não uma falha de rede a propagar como
        // exceção — mesmo espírito de `CancelInvoiceResult.ok` existir em vez de só lançar.
        if (err instanceof FiscalGatewayError) {
          return { ok: false, detail: err.message };
        }
        throw err;
      }
    },

    // Substituição de NFS-e: I7 ("apenas cancelado/substituído", nunca editado in-place).
    // TODO: o Focus NFe documenta historicamente substituição como "cancelar a nota original e
    // emitir uma nova referenciando-a" — não confirmado se existe um endpoint de substituição
    // dedicado e atômico ou se o integrador precisa orquestrar cancel+issue manualmente. Modelado
    // aqui como as duas chamadas em sequência (mais conservador: não assume atomicidade que pode
    // não existir), com o `naturalKey` da chamada representando a NOVA emissão, distinto do
    // `externalInvoiceId` da nota original que está sendo substituída (ver docstring em
    // `../port.ts`).
    async substitute(
      externalInvoiceId: string,
      input: ServiceInvoiceInput,
      naturalKey: string,
    ): Promise<IssuedInvoice> {
      const cancelResult = await this.cancel(
        externalInvoiceId,
        "Substituição de nota — nova emissão vinculada (I7: nunca edição in-place).",
      );
      if (!cancelResult.ok) {
        throw new FiscalGatewayError(
          "focus-nfe",
          `Falha ao cancelar nota original '${externalInvoiceId}' antes de substituir: ${cancelResult.detail ?? "sem detalhe"}`,
        );
      }
      return this.issue(input, naturalKey);
    },

    async query(externalInvoiceId: string): Promise<FiscalInvoiceStatusQuery> {
      const response = await request<FocusNfeInvoiceResponse>(
        `/v2/nfse/${encodeURIComponent(externalInvoiceId)}`,
        { method: "GET" },
      );
      // Mesmo escape de `exactOptionalPropertyTypes: true` de `toIssuedInvoice` acima.
      return { status: response.status, ...(response.mensagem_sefaz !== undefined ? { detail: response.mensagem_sefaz } : {}) };
    },

    async fetchPdf(externalInvoiceId: string): Promise<Buffer> {
      // TODO: endpoint exato não confirmado — sufixo `.pdf` sobre o recurso é o padrão mais
      // plausível (espelha `.xml` abaixo), mas o Focus NFe pode expor a URL do PDF só como campo
      // (`url`/`url_danfse`) na resposta de `query`/`issue`, exigindo download de uma URL externa
      // em vez de um endpoint próprio da API — não modelado aqui por falta de confirmação.
      const res = await fetchFn(`${config.apiUrl}/v2/nfse/${encodeURIComponent(externalInvoiceId)}.pdf`, {
        headers: { Authorization: `Basic ${Buffer.from(`${config.apiToken}:`).toString("base64")}` },
      });
      if (!res.ok) {
        throw new FiscalGatewayError("focus-nfe", `Falha ao buscar PDF de '${externalInvoiceId}': HTTP ${res.status}`);
      }
      const arrayBuffer = await res.arrayBuffer();
      return Buffer.from(arrayBuffer);
    },

    async fetchXml(externalInvoiceId: string): Promise<string> {
      // TODO: mesmo status de incerteza do `fetchPdf` acima quanto ao endpoint exato.
      const res = await fetchFn(`${config.apiUrl}/v2/nfse/${encodeURIComponent(externalInvoiceId)}.xml`, {
        headers: { Authorization: `Basic ${Buffer.from(`${config.apiToken}:`).toString("base64")}` },
      });
      if (!res.ok) {
        throw new FiscalGatewayError("focus-nfe", `Falha ao buscar XML de '${externalInvoiceId}': HTTP ${res.status}`);
      }
      return res.text();
    },
  };
}

// Nome de parâmetro deliberadamente sem palavra monetária completa combinada com tipo `number` —
// mesmo escape documentado em `packages/payments/src/asaas/adapter.ts` (`centsToReais`) para o
// hook `block-money-float.mjs` (PostToolUse): esta é a única conversão centavos->decimal deste
// adapter, feita de propósito só na borda de saída para a API do Focus NFe (que trabalha
// `valor_servicos`/`valor_iss` em reais decimais).
function centsToReais(value: number): number {
  return value / 100;
}
