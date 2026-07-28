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
export * from "./evidence/assurance-level";
export * from "./evidence/perceptual-hash";
export * from "./ledger/account";
export * from "./ledger/ledger-entry";
export * from "./ledger/post-double-entry";
export * from "./ledger/posting-rules";
export * from "./approval/approval-request";
export * from "./approval/approval-state-machine";
export * from "./approval/step-up";
export * from "./channel/listing-mapping";
export * from "./channel/calendar-delta";
export * from "./channel/rate-delta";
export * from "./channel/divergence";
export * from "./channel/reconciliation";
export * from "./channel/external-reservation";
export * from "./fiscal/tax-rule";
export * from "./fiscal/service-invoice";
export * from "./fiscal/natural-key";
export * from "./administration/administration-contract";
export * from "./administration/payout-extract";
export * from "./housekeeping/checklist";
export * from "./housekeeping/claim-deadline";

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
// administration/ (Fase 5, Passo 1) reforça a mesma regra dura de "tabela versionada, nunca
// código" aplicada ao contrato de administração: `AdministrationContract` + `resolveAdmini
// strationContractForDate` recusam ambiguidade de vigência sobreposta do mesmo jeito que
// `TaxRule`, e — docs/decisoes-de-negocio.md, pergunta 4 confirmada — o modelo de pagamento de
// itens operacionais (`titan_pays_all` vs. `owner_pays_itemized`) é sempre CONFIGURÁVEL POR
// UNIDADE via esse contrato, nunca um modelo único global hardcoded em `computePayoutExtract`.
// approval/step-up.ts (Fase 5, Passo 1) modela a Camada 3 da seção 9.4.1 do prompt único: o
// step-up de repasse acima de R$ 5.000 (docs/decisoes-de-negocio.md, pergunta 5) é vinculado
// criptograficamente ao hash do payload exato do lote (`buildStepUpChallenge`/
// `verifyStepUpChallenge`) — nunca uma segunda confirmação desvinculada do que está sendo
// aprovado (anti-padrão #15).
// evidence/assurance-level.ts e housekeeping/ (Fase 6, Passo 1) reforçam I9 e I10 sem duplicar
// nem reabrir nada já modelado: I9 (nenhuma unidade recebe check-in fora de `ready`) continua
// garantida só por `unit/state-machine.ts` — `computeChecklistScore` INSTRUMENTA essa máquina de
// estados (fornece `{ scorePercent, passed }` para quem decide a transição `clean -> inspected`),
// nunca a substitui nem transiciona `UnitStatus` sozinho. I10 (evidência nunca é excluída, só
// descartada com motivo) segue garantida estruturalmente só por `evidence/chain.ts` (não tocado
// nesta tarefa) — `enforceAssuranceLevel`/`MINIMUM_ASSURANCE_BY_CONSEQUENCE` acrescentam a regra
// da seção 9.9: o nível de garantia (`AssuranceLevel`, reexportado de `chain.ts`, nunca
// redeclarado) mínimo para destravar uma CONSEQUÊNCIA FINANCEIRA (liberar unidade, reprovar
// serviço, cobrar enxoval, reter caução, sinistro de canal, cobrar prestador) — e nunca bloqueia
// o trabalho operacional em si, só a ação que move dinheiro. `housekeeping/claim-deadline.ts`
// reforça mais uma vez "prazo de canal: tabela versionada, nunca código", agora para o prazo de
// abertura de sinistro/dossiê de dano contra a OTA. Decisão de escopo explícita desta tarefa: a
// pergunta 3 de docs/decisoes-de-negocio.md (vínculo da camareira) segue pendente — nenhum
// bounded context `workforce`/controle de jornada é modelado aqui; o checklist é só especificação
// de escopo do serviço (seção 9.10.6).
