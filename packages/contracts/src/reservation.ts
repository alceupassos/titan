// Contratos Zod do fluxo de cotação/reserva (Fase 1, Passo 5 — docs/fase-atual.md). Fonte única
// de validação para as Server Actions de `apps/console` (regra dura do CLAUDE.md raiz: "Toda
// Server Action valida (Zod) e autoriza (CASL) dentro dela mesma") e, mais adiante, para
// OpenAPI/tool schema de agente. Espelha os agregados de `@titan/domain`
// (`packages/domain/src/quote/quote.ts`, `packages/domain/src/reservation/state-machine.ts`) sem
// depender desse pacote: `@titan/contracts` é consumido tanto por client components (bundle do
// navegador) quanto por Server Actions, e não deve arrastar lógica de domínio para o cliente.
//
// Datas de estadia trafegam como string civil "YYYY-MM-DD" (`checkinISO`/`checkoutISO`), nunca
// timestamp — mesma regra dura de `@titan/dates` (docs/anti-padroes.md #9). O tipo `Stay`/
// `CivilDate` propriamente ditos continuam vivendo só em `@titan/domain`/`@titan/dates`; aqui é
// só a representação de borda (entrada HTTP/Server Action).
import { z } from "zod";

const uuidSchema = z.string().uuid();

const civilDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato YYYY-MM-DD (data civil, sem hora/fuso).");

const currencyCodeSchema = z.enum(["BRL", "USD", "EUR"]);

const channelSchema = z.enum(["direct", "airbnb", "booking", "vrbo", "expedia"]);

export const QuoteRequestSchema = z.object({
  unitId: uuidSchema,
  checkinISO: civilDateSchema,
  checkoutISO: civilDateSchema,
  ratePlanId: uuidSchema,
});
export type QuoteRequest = z.infer<typeof QuoteRequestSchema>;

// Espelha `Quote` de `@titan/domain` (packages/domain/src/quote/quote.ts):
//   - `stay` serializado como par de datas civis ISO (`{checkin, checkout}`), simétrico com
//     `QuoteRequestSchema.checkinISO/checkoutISO` — escolha explícita sobre "string única"
//     porque o client precisa reexibir check-in/check-out separadamente no passo de confirmação.
//   - `priceAmount` espelha `Money` de `@titan/money`: inteiro em centavos + moeda, nunca float.
export const QuoteResponseSchema = z.object({
  id: z.string(),
  unitId: uuidSchema,
  stay: z.object({
    checkin: civilDateSchema,
    checkout: civilDateSchema,
  }),
  ratePlanId: uuidSchema,
  priceAmount: z.object({
    amountCents: z.number().int(),
    currency: currencyCodeSchema,
  }),
  expiresAtEpochMs: z.number().int(),
});
export type QuoteResponse = z.infer<typeof QuoteResponseSchema>;

// `quoteId` aqui é rastreabilidade ("qual cotação o usuário confirmou"), não uma chave de lookup
// server-side — não existe tabela de cotações persistida nesta fase (fora do escopo autorizado:
// `packages/db` não pode ser editado por esta faixa). O preço realmente cobrado é RECALCULADO a
// partir de `ratePlanId` + estadia no momento da confirmação (mesma função `priceStay`, mesma
// regra de "nunca confiar no preço enviado pelo cliente" documentada em
// `packages/domain/src/quote/quote.ts`) — ver `apps/console/app/(staff)/reservas/nova/actions.ts`.
export const CreateReservationSchema = z.object({
  quoteId: z.string(),
  unitId: uuidSchema,
  checkinISO: civilDateSchema,
  checkoutISO: civilDateSchema,
  ratePlanId: uuidSchema,
  channel: channelSchema,
});
export type CreateReservation = z.infer<typeof CreateReservationSchema>;
