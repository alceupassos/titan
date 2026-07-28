// Fase 3, Passo 4a — geração e parse de feed iCal (.ics), puros e sem I/O de rede: quem busca a
// URL do feed remoto (GET) e quem serve o feed gerado por uma rota HTTP é `apps/worker`/`apps/web`
// (a borda), faixas paralelas fora de escopo deste pacote. Estas funções só transformam texto.
//
// Decisão: gerar/parsear o texto `.ics` manualmente em vez de adicionar a dependência
// `ical-generator` (ou uma lib de parse tipo `node-ical`) — o formato necessário aqui é
// deliberadamente estreito (eventos de dia inteiro, `VALUE=DATE`, sem recorrência/timezone/
// alarme/anexo), então escrever as ~30 linhas do RFC 5545 mínimo é mais simples de auditar do que
// puxar uma dependência nova cujo escopo é muito maior que o que usamos. Se uma fase futura
// precisar de recorrência (RRULE) ou de robustez contra feeds de terceiros mal-formados além do
// que os testes desta faixa cobrem, revisitar essa escolha.
import type { CalendarDelta } from "@titan/domain";
import type { AvailabilitySnapshot } from "@titan/domain";
import { civilDate, type CivilDate } from "@titan/dates";

const PRODID = "-//Titan Stay//Distribution iCal Adapter//PT-BR";

function toIcsDate(date: CivilDate): string {
  // "2026-01-01" -> "20260101" (VALUE=DATE do RFC 5545, sem hora nem fuso — mesmo espírito de
  // nunca tratar data de estadia como timestamp, docs/anti-padroes.md #9).
  return date.replaceAll("-", "");
}

function fromIcsDate(value: string): CivilDate {
  const digitsOnly = value.trim();
  const year = digitsOnly.slice(0, 4);
  const month = digitsOnly.slice(4, 6);
  const day = digitsOnly.slice(6, 8);
  return civilDate(`${year}-${month}-${day}`);
}

/** `2026-01-01` -> `2026-01-02`. Implementado localmente (sem tocar `@titan/dates`, fora do
 * escopo desta faixa) via `Date.UTC` — seguro porque `CivilDate` nunca carrega hora/fuso, então
 * não há ambiguidade de DST na aritmética de dia civil. */
function addOneDay(date: CivilDate): CivilDate {
  const parts = date.split("-");
  // `Number(...)` aceita `string | undefined` sem erro de tipo (assinatura é `Number(value?: any)`)
  // — evita depender de como `noUncheckedIndexedAccess` tipa acesso indexado após `.split()`.
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + 1);
  const iso = next.toISOString().slice(0, 10);
  return civilDate(iso);
}

function formatDtstamp(epochMs: number): string {
  // DTSTAMP exige DATE-TIME UTC (sufixo "Z") por RFC 5545 — única data neste arquivo que É um
  // instante de verdade (quando o feed foi gerado), não uma data civil de estadia/bloqueio.
  return new Date(epochMs).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/**
 * Gera o conteúdo de um feed `.ics` a partir dos deltas de disponibilidade de UMA unidade.
 * Só dias com `blocked: true` viram `VEVENT` — iCal não tem um evento "disponível"; ausência de
 * evento em um dia já significa disponível para quem consome o feed. Deltas cujo `unitId` não
 * bate com o parâmetro `unitId` são ignorados silenciosamente no feed, mas contados em
 * `skippedOtherUnit` no retorno, para o chamador decidir se isso é um bug do lado dele (não é
 * responsabilidade deste pacote lançar erro por dado potencialmente malformado do caller).
 */
export interface GenerateIcsFeedResult {
  readonly icsText: string;
  readonly blockedDayCount: number;
  readonly skippedOtherUnit: number;
}

export function generateIcsFeed(
  unitId: string,
  calendar: readonly CalendarDelta[],
  nowEpochMs: number,
): GenerateIcsFeedResult {
  const forThisUnit = calendar.filter((d) => d.unitId === unitId);
  const skippedOtherUnit = calendar.length - forThisUnit.length;
  const blockedDays = forThisUnit.filter((d) => d.blocked);
  const dtstamp = formatDtstamp(nowEpochMs);

  const events = blockedDays
    .map((d) => {
      const start = toIcsDate(d.date);
      const end = toIcsDate(addOneDay(d.date));
      return [
        "BEGIN:VEVENT",
        `UID:titan-${unitId}-${start}@titanstay`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;VALUE=DATE:${start}`,
        `DTEND;VALUE=DATE:${end}`,
        "SUMMARY:Blocked",
        "END:VEVENT",
      ].join("\r\n");
    })
    .join("\r\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    ...(events.length > 0 ? [events] : []),
    "END:VCALENDAR",
  ];

  return {
    icsText: lines.join("\r\n") + "\r\n",
    blockedDayCount: blockedDays.length,
    skippedOtherUnit,
  };
}

/**
 * Parseia um feed `.ics` de terceiro (Airbnb/Booking/VRBO/Expedia exportam disponibilidade nesse
 * formato) e devolve os dias bloqueados como `AvailabilitySnapshot[]`, expandindo cada `VEVENT`
 * de `DTSTART` (inclusive) até `DTEND` (exclusivo, mesma semântica de `Stay.checkout` em
 * `@titan/dates`) em uma entrada por dia civil. `unitId` é injetado pelo chamador — o feed em si
 * não carrega o identificador interno da unidade (é escopado por listing externo, não por
 * `unitId` do Titan); quem já resolveu o `ListingMapping` correspondente ao feed passa o
 * `unitId` certo aqui.
 *
 * Suporta apenas `VALUE=DATE` (evento de dia inteiro) — o único formato que feeds de
 * disponibilidade de OTA usam na prática para bloqueio de calendário. `VEVENT` com
 * `DTSTART`/`DTEND` em `DATE-TIME` (evento com hora) é ignorado; limitação documentada, não bug
 * silencioso — disponibilidade de reserva é sempre por dia civil, nunca por hora.
 */
export function parseIcsFeed(icsText: string, unitId: string): AvailabilitySnapshot[] {
  const veventBlocks = icsText.split("BEGIN:VEVENT").slice(1);
  const snapshots: AvailabilitySnapshot[] = [];

  for (const block of veventBlocks) {
    const body = block.split("END:VEVENT")[0] ?? "";
    const dtstartMatch = body.match(/DTSTART;VALUE=DATE:(\d{8})/);
    const dtendMatch = body.match(/DTEND;VALUE=DATE:(\d{8})/);
    const dtstartValue = dtstartMatch?.[1];
    const dtendValue = dtendMatch?.[1];
    if (!dtstartValue || !dtendValue) {
      // Evento sem VALUE=DATE (ex.: DATE-TIME) — fora do escopo suportado, ver docstring acima.
      continue;
    }

    let cursor = fromIcsDate(dtstartValue);
    const end = fromIcsDate(dtendValue);
    while (cursor < end) {
      snapshots.push({ unitId, date: cursor, blocked: true });
      cursor = addOneDay(cursor);
    }
  }

  return snapshots;
}
