export * from "./fsm";
export * from "./events";
export * from "./reservation/state-machine";
export * from "./payment/state-machine";
export * from "./unit/state-machine";
export * from "./fiscal-document/state-machine";
export * from "./work-order/state-machine";
export * from "./evidence/chain";

// Nota de cobertura de invariantes neste pacote (zero I/O) — ver docs/invariantes.md:
// I1, I2, I3 (via ausência de update/delete no chain + estados terminais), I5 (events/index.ts
// dá a forma, emissão real fica na borda), I7, I9, I10 são expressáveis e testadas aqui.
// I4 (nenhum dado de cartão na aplicação) e I6 (idempotência de webhook) são invariantes de
// borda/infra — não fazem sentido como função pura de domínio, aplicam-se em packages/payments.
// I8 (snapshot de decisão de pricing) pertence ao bounded context pricing_intel, ainda não
// existente (Fase 8) — não fabricado aqui.
