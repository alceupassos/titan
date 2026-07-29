import { boolean, customType, integer, pgTable, text, time, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { units } from "./unit";

// `daterange` não tem tipo nativo no drizzle-orm — customType representa a coluna como string
// no formato de range do Postgres ("[2026-06-01,2026-06-04)") no lado TS, mantendo o tipo real
// `daterange` no banco (necessário para a constraint EXCLUDE USING gist de I1, que só existe em
// SQL puro na migration — drizzle-kit generate não sabe recriar EXCLUDE sozinho, mesma tensão já
// aceita para RLS desde a Fase 0).
const dateRange = customType<{ data: string }>({
  dataType() {
    return "daterange";
  },
});

export const reservations = pgTable("reservations", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  unitId: uuid("unit_id")
    .notNull()
    .references(() => units.id),
  stay: dateRange("stay").notNull(),
  status: text("status").notNull(),
  channel: text("channel").notNull(),
  externalRef: text("external_ref"),
  priceCents: integer("price_cents").notNull(),
  currency: text("currency").notNull(),
  // Planoexplica.md, Grupo B/C — quantos hóspedes ficam nesta estadia. `stay` continua sendo
  // data civil pura (I1 exige isso); estes campos são metadado operacional, nunca usados em
  // nenhum cálculo de disponibilidade/preço. Nullable de propósito: reserva já existente (ex.
  // vinda de canal externo antes desta migration) nunca ganha um valor inventado.
  guestCount: integer("guest_count"),
  // Horário informado pelo hóspede/canal — nunca confundir com o horário PADRÃO de operação
  // (`STANDARD_CHECKIN_HOUR_UTC`/`STANDARD_CHECKOUT_HOUR_UTC`, hoje só uma constante de UI em
  // apps/console/app/(staff)/limpeza/page.tsx). Nullable: maioria das reservas não informa hora
  // exata, só a data civil do check-in/check-out.
  checkinTime: time("checkin_time"),
  checkoutTime: time("checkout_time"),
  // Early check-in (Grupo C do planoexplica.md) — mesmo espírito de `CheckInOverride`
  // (packages/domain/src/unit/state-machine.ts: motivo + quem autorizou), mas para a AUTORIZAÇÃO
  // do horário antecipado, não para o check-in em si. `earlyCheckinPaid` só tem sentido quando
  // `earlyCheckinRequested` é true — nunca inferir "não solicitado" como "gratuito".
  earlyCheckinRequested: boolean("early_checkin_requested").notNull().default(false),
  earlyCheckinPaid: boolean("early_checkin_paid"),
  earlyCheckinAuthorizedBy: text("early_checkin_authorized_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
