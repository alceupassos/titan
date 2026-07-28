// Route Handler consumido pelo app de campo (apps/field/lib/api-client.ts::postTaskCompletion) —
// Fase 9, Passo 5. Delega para `recordTaskCompletionAction`
// (apps/console/app/(staff)/equipe/produtividade/actions.ts) — nunca uma segunda implementação da
// lógica de gravação; este arquivo só traduz HTTP <-> Server Action.
import { NextResponse } from "next/server";
import { recordTaskCompletionAction } from "@/app/(staff)/equipe/produtividade/actions";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido (JSON esperado)." }, { status: 400 });
  }

  const result = await recordTaskCompletionAction(body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, id: result.data.id });
}
