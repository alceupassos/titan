// Fixtures fabricadas para os testes de contrato deste adapter (adapter.test.ts) — nenhuma
// delas é resposta real capturada de uma chamada de rede (sem credenciais/sandbox Asaas nesta
// sessão, ver TODO em adapter.ts). Formato consistente com o que a doc histórica da API v3 do
// Asaas descreve para POST /payments, POST /payments/{id}/refund e o payload de webhook.
//
// I4: nenhum valor aqui é ou se parece com PAN de cartão — o adapter cobre só PIX. Este arquivo
// é varrido por `no-pan.test.ts` junto com o resto do pacote.

export const pixPaymentCreatedFixture = {
  id: "pay_9x8y7z6w5v",
  dateCreated: "2026-07-27",
  customer: "cus_000005219653",
  paymentLink: null,
  value: 150.0,
  netValue: 148.55,
  billingType: "PIX",
  status: "PENDING",
  dueDate: "2026-07-27",
  originalDueDate: "2026-07-27",
  // UUID de exemplo padrão (RFC 4122, sem significado especial) — de propósito com letras
  // hex intercaladas, não uma sequência longa só de dígitos: uma reservationId toda numérica
  // (ex.: "11111111-1111-...") cairia no próprio padrão de PAN que `no-pan.test.ts` varre.
  externalReference: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  invoiceUrl: "https://sandbox.asaas.com/i/9x8y7z6w5v",
  invoiceNumber: "00000001",
  deleted: false,
} as const;

export const pixPaymentReceivedFixture = {
  ...pixPaymentCreatedFixture,
  status: "RECEIVED",
  paymentDate: "2026-07-27",
} as const;

export const pixPaymentRefundedFixture = {
  ...pixPaymentReceivedFixture,
  status: "REFUNDED",
} as const;

export const webhookPaymentReceivedFixture = {
  id: "evt_a1b2c3d4e5",
  event: "PAYMENT_RECEIVED",
  payment: pixPaymentReceivedFixture,
} as const;

export const webhookPaymentRefundedFixture = {
  id: "evt_f6g7h8i9j0",
  event: "PAYMENT_REFUNDED",
  payment: pixPaymentRefundedFixture,
} as const;

// Payload sem `id` de evento — exercita o fallback determinístico de externalEventId em
// parseWebhook (payment.id + event), documentado como incerteza real (Asaas nem sempre expõe
// um id de evento dedicado e estável em todo payload de webhook conhecido).
export const webhookPaymentReceivedWithoutEventIdFixture = {
  event: "PAYMENT_RECEIVED",
  payment: pixPaymentReceivedFixture,
} as const;

export const ASAAS_WEBHOOK_TOKEN_FIXTURE = "fixture-webhook-token-nao-e-segredo-real-abc123";
