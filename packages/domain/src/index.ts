export * from "./fsm";
export * from "./events";
export * from "./reservation/state-machine";
export * from "./rate-plan/rate-plan";
export * from "./quote/quote";
export * from "./payment/state-machine";
export * from "./unit/state-machine";
export * from "./fiscal-document/state-machine";
export * from "./work-order/state-machine";
export * from "./evidence/chain";
export * from "./ledger/account";
export * from "./ledger/ledger-entry";
export * from "./ledger/post-double-entry";
export * from "./ledger/posting-rules";
export * from "./approval/approval-request";
export * from "./approval/approval-state-machine";
export * from "./channel/listing-mapping";
export * from "./channel/calendar-delta";
export * from "./channel/rate-delta";
export * from "./channel/divergence";
export * from "./channel/reconciliation";
export * from "./channel/external-reservation";
export * from "./fiscal/tax-rule";
export * from "./fiscal/service-invoice";
export * from "./fiscal/natural-key";

// Nota de cobertura de invariantes neste pacote (zero I/O) — ver docs/invariantes.md:
// I1, I2, I3 (via ausência de update/delete no chain + estados terminais, e agora também via
// ledger/ — postDoubleEntry só cria, nunca edita; estorno é lançamento novo com reversalOfId),
// I5 (events/index.ts dá a forma, emissão real fica na borda), I7, I9, I10 são expressáveis e
// testadas aqui.
// I4 (nenhum dado de cartão na aplicação) e I6 (idempotência de webhook) são invariantes de
// borda/infra — não fazem sentido como função pura de domínio, aplicam-se em packages/payments.
// I8 (snapshot de decisão de pricing) pertence ao bounded context pricing_intel, ainda não
// existente (Fase 8) — não fabricado aqui.
// channel/ (Fase 3, distribuição) reforça I1 para reserva vinda de canal externo (Airbnb,
// Booking, VRBO, Expedia): `mapExternalReservationToDomain` traduz o shape externo para
// `ReservationForOverlapCheck` e é validada com o MESMO `canAcceptReservation` que a reserva
// direta usa — não existe caminho de validação separado por canal (docs/anti-padroes.md #5).
// fiscal/ (Fase 4, começando) reforça duas regras duras do CLAUDE.md raiz: "alíquota, código de
// serviço, retenção e prazo de canal: tabela versionada, nunca código" — via `TaxRule` +
// `resolveTaxRuleForDate`, que só aceitam alíquota vinda de uma tabela vigente por
// município+serviço+data, nunca uma constante numérica no código, e recusam ambiguidade de
// vigência sobreposta em vez de escolher a primeira em silêncio — e a idempotência forte de
// emissão da seção 9.6 do prompt único — via `buildNaturalKey`, determinística e sem I/O, que
// existe para o banco (Passo 2 desta fase) rejeitar via `UNIQUE` uma segunda tentativa de
// emissão para o mesmo fato gerador antes mesmo de chamar o provedor de novo. I7 (documento
// fiscal emitido não é editável) já estava modelada em `fiscal-document/state-machine.ts`
// (Fase 0) e é reutilizada, não recriada, por `service-invoice.ts`.
