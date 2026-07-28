// Route Handler consumido pelo app de campo (apps/field/lib/api-client.ts::postWorkOrder) — Fase
// 9, Passo 5. Delega para `openWorkOrderAction`
// (apps/console/app/(staff)/limpeza/servicos/actions.ts, já real desde a Fase 6) — nunca uma
// segunda FSM/implementação de OS. O envelope de evidência da foto (se houver) só é usado aqui
// para confirmar que a captura ocorreu; a persistência de evidência em `evidence_log` (I10) segue
// fora de escopo deste endpoint (a OS técnica em si não exige evidência assinada nesta fase).
//
// Nunca importe `OpenWorkOrderSchema` (ou qualquer export que não seja função async) de um módulo
// "use server" para dentro de um Route Handler — Next.js exige que TODO export de um arquivo
// "use server" seja função async quando esse módulo é referenciado fora de um Server Component
// (erro real de build encontrado nesta sessão: "A 'use server' file can only export async
// functions, found object"). A validação Zod já acontece DENTRO de `openWorkOrderAction`
// (`OpenWorkOrderSchema.safeParse`) — este handler só repassa o corpo bruto, nunca reimplementa a
// validação.
import { NextResponse } from "next/server";
import { openWorkOrderAction } from "@/app/(staff)/limpeza/servicos/actions";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido (JSON esperado)." }, { status: 400 });
  }

  const result = await openWorkOrderAction(body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, workOrderId: result.data.workOrderId });
}
