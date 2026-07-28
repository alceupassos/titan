// Fixtures fabricadas para os testes de contrato deste adapter (adapter.test.ts) — nenhuma delas
// é resposta real capturada de uma chamada de rede (sem credenciais/homologação Focus NFe nesta
// sessão, ver TODO em adapter.ts). Formato consistente com o que é publicamente conhecido sobre a
// API de NFS-e do Focus NFe (emissão assíncrona: PUT aceito -> status "processando_autorizacao"
// -> consulta posterior confirma "autorizado" ou "erro_autorizacao").
//
// I4-adjacente (PII fiscal, não PAN): nenhum CPF/CNPJ real aparece aqui — usa-se um CPF de
// formato válido mas fabricado, nunca um documento de pessoa real. Varrido junto do resto do
// pacote por `no-pii.test.ts`.

import type { ServiceInvoiceInput } from "@titan/domain";

export const FOCUS_NFE_API_TOKEN_FIXTURE = "fixture-focus-nfe-token-nao-e-segredo-real-xyz789";

export const sampleServiceInvoiceInput: ServiceInvoiceInput = {
  reservationId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  municipalityCode: "3550308", // São Paulo (IBGE)
  serviceCode: "09.01", // LC 116/2003, item 9.01 — hospedagem
  baseAmountCents: 50000,
  currency: "BRL",
  taxAmountCents: 1500,
  issuerName: "Titan Empreendimentos Ltda",
  takerDocument: "11144477735", // CPF de formato válido, fabricado — não é pessoa real
  description: "Hospedagem — reserva 3fa85f64, 3 diárias",
};

export const naturalKeyFixture = "3fa85f64-5717-4562-b3fc-2c963f66afa6:checkout:2026-07-27";

// Resposta de PUT /v2/nfse?ref=... aceita — Focus NFe processa de forma assíncrona, então o
// primeiro retorno normalmente é "processando", não "autorizado" ainda.
export const focusNfeIssueAcceptedFixture = {
  ref: naturalKeyFixture,
  status: "processando_autorizacao",
} as const;

// Resposta de GET /v2/nfse/{ref} depois de processada — autorizada com sucesso.
export const focusNfeQueryAuthorizedFixture = {
  ref: naturalKeyFixture,
  status: "autorizado",
  numero: "00000123",
  codigo_verificacao: "ABC12345",
  url: "https://homologacao.focusnfe.com.br/danfse/ABC12345.pdf",
  caminho_xml_nota_fiscal: "https://homologacao.focusnfe.com.br/xml/ABC12345.xml",
} as const;

// Resposta de erro de autorização (ex.: dado do tomador rejeitado pela SEFAZ/prefeitura).
export const focusNfeErrorFixture = {
  ref: naturalKeyFixture,
  status: "erro_autorizacao",
  mensagem_sefaz: "Código de serviço não habilitado para o prestador.",
  erros: [{ mensagem: "Código de serviço não habilitado para o prestador." }],
} as const;

// Resposta de cancelamento bem-sucedido (DELETE /v2/nfse/{ref}).
export const focusNfeCancelOkFixture = {
  ref: naturalKeyFixture,
  status: "cancelado",
  mensagem_sefaz: "Nota cancelada com sucesso.",
} as const;
