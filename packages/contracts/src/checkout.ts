// Contrato do checkout do storefront (Fase 2, Passo 3 — docs/fase-atual.md). Mesmo espírito de
// packages/contracts/src/reservation.ts: fonte única de validação para a Server Action de
// checkout de `apps/web`, datas civis como string ISO, nunca timestamp. `stay`/`Money`
// propriamente ditos continuam só em `@titan/domain`/`@titan/dates`/`@titan/money` — este pacote
// é consumido por client components (bundle do navegador) e não deve arrastar lógica de domínio.
import { z } from "zod";

const uuidSchema = z.string().uuid();

const civilDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato YYYY-MM-DD (data civil, sem hora/fuso).");

// Método de pagamento escolhido pelo hóspede — decide o roteamento simples por método desta fase
// (PIX -> Asaas, cartão internacional -> Stripe; o roteador declarativo completo por custo/taxa de
// aprovação da seção 9.3 do prompt único é trabalho de fase futura).
export const PaymentMethodSchema = z.enum(["pix", "card"]);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

export const GuestSchema = z.object({
  name: z.string().min(1, "Nome do hóspede principal é obrigatório."),
  email: z.string().email("E-mail inválido."),
  phone: z.string().min(8, "Telefone inválido."),
});
export type Guest = z.infer<typeof GuestSchema>;

// Nenhum campo de cartão aqui, de propósito (I4 — nenhum dado de cartão trafega pela aplicação):
// o pagamento por cartão usa hosted fields/tokenização do próprio gateway no cliente; o que chega
// nesta Server Action é, no máximo, um token/id de pagamento já criado pelo SDK do gateway no
// navegador, nunca PAN/CVV.
export const CheckoutRequestSchema = z.object({
  unitId: uuidSchema,
  checkinISO: civilDateSchema,
  checkoutISO: civilDateSchema,
  ratePlanId: uuidSchema,
  guest: GuestSchema,
  paymentMethod: PaymentMethodSchema,
});
export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;

export const CheckoutResponseSchema = z.object({
  reservationId: z.string().uuid(),
  paymentIntentId: z.string().uuid(),
  status: z.enum(["created", "authorized"]),
});
export type CheckoutResponse = z.infer<typeof CheckoutResponseSchema>;
