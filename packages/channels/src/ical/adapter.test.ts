// Fase 3, Passo 4a — testes de `IcalChannelAdapter` e das funções puras de feed (`feed.ts`).
// Cobre: (1) geração de `.ics` a partir de `CalendarDelta[]` produz texto parseável de volta;
// (2) parse de um fixture `.ics` pequeno extrai os dias bloqueados corretos; (3)
// `detectAvailabilityDrift` (de `@titan/domain`) aplicado ao resultado do parse vs. um snapshot
// local diferente produz a divergência esperada; (4) capabilities/erros de "não suportado" do
// adapter para as operações que iCal genuinamente não tem.
import { describe, expect, it } from "vitest";
import { civilDate } from "@titan/dates";
import { detectAvailabilityDrift, type CalendarDelta, type AvailabilitySnapshot } from "@titan/domain";
import { generateIcsFeed, parseIcsFeed } from "./feed";
import { IcalChannelAdapter } from "./adapter";
import { NotSupportedByAdapterError } from "../port";

const UNIT_ID = "unit-1";
const NOW_EPOCH_MS = Date.UTC(2026, 0, 1, 12, 0, 0);

describe("generateIcsFeed", () => {
  it("gera um feed .ics válido a partir de CalendarDelta[] (só dias bloqueados viram VEVENT)", () => {
    const calendar: CalendarDelta[] = [
      { unitId: UNIT_ID, date: civilDate("2026-02-10"), blocked: true },
      { unitId: UNIT_ID, date: civilDate("2026-02-11"), blocked: true },
      { unitId: UNIT_ID, date: civilDate("2026-02-12"), blocked: false },
      { unitId: "outra-unidade", date: civilDate("2026-02-10"), blocked: true },
    ];

    const result = generateIcsFeed(UNIT_ID, calendar, NOW_EPOCH_MS);

    expect(result.icsText).toContain("BEGIN:VCALENDAR");
    expect(result.icsText).toContain("END:VCALENDAR");
    expect(result.icsText).toContain("VERSION:2.0");
    expect(result.blockedDayCount).toBe(2);
    expect(result.skippedOtherUnit).toBe(1);

    // Parseável de volta: o parse deve recuperar exatamente os 2 dias bloqueados desta unidade.
    const parsed = parseIcsFeed(result.icsText, UNIT_ID);
    expect(parsed).toHaveLength(2);
    expect(parsed.map((s) => s.date).sort()).toEqual(["2026-02-10", "2026-02-11"]);
    expect(parsed.every((s) => s.blocked)).toBe(true);
  });

  it("gera um VCALENDAR válido mesmo sem nenhum dia bloqueado", () => {
    const result = generateIcsFeed(UNIT_ID, [], NOW_EPOCH_MS);
    expect(result.icsText).toContain("BEGIN:VCALENDAR");
    expect(result.icsText).toContain("END:VCALENDAR");
    expect(result.blockedDayCount).toBe(0);
    expect(parseIcsFeed(result.icsText, UNIT_ID)).toHaveLength(0);
  });
});

describe("parseIcsFeed", () => {
  // Fixture pequeno escrito à mão (não gerado por generateIcsFeed) — simula um feed real de
  // terceiro (Airbnb/Booking exportam nesse formato), com um evento de 3 dias (10, 11, 12 de
  // março — DTEND é exclusivo, RFC 5545 igual à semântica de Stay.checkout).
  const FIXTURE_ICS = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Airbnb Inc//Hosting Calendar//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    "UID:abnb-reserva-123@airbnb.com",
    "DTSTAMP:20260101T000000Z",
    "DTSTART;VALUE=DATE:20260310",
    "DTEND;VALUE=DATE:20260313",
    "SUMMARY:Reserved",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  it("extrai os dias bloqueados corretos de um fixture .ics de terceiro", () => {
    const parsed = parseIcsFeed(FIXTURE_ICS, UNIT_ID);
    expect(parsed.map((s) => s.date)).toEqual(["2026-03-10", "2026-03-11", "2026-03-12"]);
    expect(parsed.every((s) => s.unitId === UNIT_ID && s.blocked)).toBe(true);
  });

  it("ignora VEVENT sem VALUE=DATE (DATE-TIME) em vez de quebrar o parse", () => {
    const icsWithDateTime = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:evento-com-hora@example.com",
      "DTSTART:20260310T100000Z",
      "DTEND:20260310T120000Z",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:evento-dia-inteiro@example.com",
      "DTSTART;VALUE=DATE:20260401",
      "DTEND;VALUE=DATE:20260402",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const parsed = parseIcsFeed(icsWithDateTime, UNIT_ID);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.date).toBe("2026-04-01");
  });
});

describe("detectAvailabilityDrift aplicado ao resultado do parse", () => {
  it("produz exatamente 1 divergência quando 1 dia difere entre o parse remoto e o snapshot local", () => {
    const remoteIcs = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20260501",
      "DTEND;VALUE=DATE:20260504",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    // Remoto (canal): 01, 02, 03/mai bloqueados.
    const remote = parseIcsFeed(remoteIcs, UNIT_ID);

    // Local (fonte de verdade do Titan): 01, 02/mai bloqueados, 03/mai LIVRE — 1 dia diverge.
    const local: AvailabilitySnapshot[] = [
      { unitId: UNIT_ID, date: civilDate("2026-05-01"), blocked: true },
      { unitId: UNIT_ID, date: civilDate("2026-05-02"), blocked: true },
      { unitId: UNIT_ID, date: civilDate("2026-05-03"), blocked: false },
    ];

    const divergences = detectAvailabilityDrift(local, remote, {
      channel: "airbnb",
      nowEpochMs: NOW_EPOCH_MS,
    });

    expect(divergences).toHaveLength(1);
    expect(divergences[0]).toMatchObject({
      unitId: UNIT_ID,
      channel: "airbnb",
      kind: "availability_mismatch",
      date: "2026-05-03",
    });
  });
});

describe("IcalChannelAdapter", () => {
  const adapter = new IcalChannelAdapter("airbnb");

  it("declara capabilities honestas — só disponibilidade, nada mais", () => {
    expect(adapter.capabilities).toEqual({
      pushRates: false,
      pushRestrictions: false,
      pullReservations: false,
      pushContent: false,
      instantBooking: false,
      messaging: false,
    });
  });

  it("pushAvailability gera o conteúdo do feed em AckResult.detail", async () => {
    const calendar: CalendarDelta[] = [{ unitId: UNIT_ID, date: civilDate("2026-06-01"), blocked: true }];
    const result = await adapter.pushAvailability(UNIT_ID, calendar);
    expect(result.ok).toBe(true);
    expect(result.detail).toContain("BEGIN:VCALENDAR");
  });

  it("syncContent lança NotSupportedByAdapterError (iCal não tem conteúdo rico)", async () => {
    await expect(adapter.syncContent({ unitId: UNIT_ID, name: "Studio Centro" })).rejects.toThrow(
      NotSupportedByAdapterError,
    );
  });

  it("pushRates lança NotSupportedByAdapterError (iCal não carrega tarifa)", async () => {
    await expect(adapter.pushRates(UNIT_ID, [])).rejects.toThrow(NotSupportedByAdapterError);
  });

  it("pullReservations lança NotSupportedByAdapterError (iCal não tem reserva estruturada)", async () => {
    await expect(adapter.pullReservations(NOW_EPOCH_MS)).rejects.toThrow(NotSupportedByAdapterError);
  });

  it("handleWebhook lança NotSupportedByAdapterError (iCal não tem webhook)", async () => {
    await expect(adapter.handleWebhook({})).rejects.toThrow(NotSupportedByAdapterError);
  });

  it("reconcile lança NotSupportedByAdapterError (pacote sem I/O de rede)", async () => {
    await expect(
      adapter.reconcile(UNIT_ID, civilDate("2026-01-01"), civilDate("2026-01-31")),
    ).rejects.toThrow(NotSupportedByAdapterError);
  });
});
