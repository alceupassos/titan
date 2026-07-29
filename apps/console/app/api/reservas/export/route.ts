// Exportação CSV de reservas (Grupo E, planoexplica.md) — nenhum exportador existia em nenhuma
// rota do cockpit antes deste arquivo (levantamento confirmou: só links para PDF já prontos de
// nota fiscal, gerados por provedor externo, nunca um exportador nosso). CSV em vez de PDF:
// mais simples, abre em Excel/Sheets, e cobre a necessidade real ("exportar relatório") sem
// puxar uma lib de geração de PDF só para isto.
//
// Route Handler, não Server Action — precisa devolver um arquivo para download
// (`Content-Disposition: attachment`), o que uma Server Action não faz. Autoriza por conta
// própria (mesma regra dura do CLAUDE.md raiz: valida e autoriza dentro de si mesma) — nunca
// confia só no `proxy.ts` (presença de cookie), que já exclui `api/auth` mas não este caminho.
import { NextResponse, type NextRequest } from "next/server";
import type { ReservationStatus } from "@titan/domain";
import { NoActiveTenantError, requireStaffSession, UnauthenticatedError } from "@/lib/auth/session";
import { listReservations } from "@/app/(staff)/reservas/queries";

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toExclusiveEndISO(inclusiveEndISO: string): string {
  const asDate = new Date(`${inclusiveEndISO}T00:00:00.000Z`);
  asDate.setUTCDate(asDate.getUTCDate() + 1);
  return toISODate(asDate);
}

function isValidStatus(value: string | null): value is ReservationStatus {
  return value === "pending" || value === "confirmed" || value === "cancelled" || value === "no_show";
}

/** Escapa um campo para CSV (RFC 4180): aspas duplas quando o valor contém vírgula, aspas ou
 * quebra de linha — nunca confiar que nome de unidade/hóspede não vai conter vírgula. */
function csvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const CSV_HEADER = ["Unidade", "Canal", "Check-in", "Check-out", "Hóspedes", "Status", "Preço (centavos)", "Moeda"];

export async function GET(request: NextRequest): Promise<Response> {
  let session;
  try {
    session = await requireStaffSession();
  } catch (err) {
    const status = err instanceof UnauthenticatedError || err instanceof NoActiveTenantError ? 401 : 500;
    return NextResponse.json({ error: "Falha ao verificar sessão." }, { status });
  }

  if (session.ability.cannot("read", "reservation")) {
    return NextResponse.json({ error: "Sem permissão para exportar reservas com o papel atual." }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const unitId = searchParams.get("unitId");
  const statusParam = searchParams.get("status");

  // Exportação nunca pagina — traz tudo que bate com o filtro, até um teto de segurança (o
  // cockpit não tem hoje volume que se aproxime disso; documentado, não um limite arbitrário
  // escondido).
  const EXPORT_ROW_LIMIT = 10_000;

  let items;
  try {
    const result = await listReservations({
      tenantId: session.tenantId,
      actorId: session.userId,
      ...(start ? { checkinFromISO: start } : {}),
      ...(end ? { checkinToExclusiveISO: toExclusiveEndISO(end) } : {}),
      ...(unitId ? { unitId } : {}),
      ...(isValidStatus(statusParam) ? { status: statusParam } : {}),
      limit: EXPORT_ROW_LIMIT,
      offset: 0,
    });
    items = result.items;
  } catch {
    return NextResponse.json({ error: "Não foi possível consultar reservas agora." }, { status: 500 });
  }

  const lines = [CSV_HEADER.join(",")];
  for (const item of items) {
    lines.push(
      [
        csvField(item.unitName),
        item.channel,
        item.stay.checkin,
        item.stay.checkout,
        item.guestCount != null ? String(item.guestCount) : "",
        item.status,
        String(item.priceCents),
        item.currency,
      ].join(","),
    );
  }
  // BOM UTF-8 no início — Excel no Windows só reconhece acentuação em CSV corretamente com BOM.
  const csvContent = `﻿${lines.join("\r\n")}`;

  return new Response(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="reservas-${toISODate(new Date())}.csv"`,
    },
  });
}
