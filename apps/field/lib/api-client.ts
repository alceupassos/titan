// Cliente HTTP mínimo do app de campo — chama os Route Handlers reais expostos em
// apps/console/app/api/field/** (Fase 9, Passo 5; endpoints Next.js, não Server Actions, porque
// um app nativo não pode invocar Server Actions do Next diretamente). `EXPO_PUBLIC_*` é o prefixo
// que o Expo inlina no bundle (documentado no comentário de app.json) — sem isso configurado, as
// chamadas abaixo falham com erro de rede real, nunca são mockadas.
//
// Sem emulador/dispositivo nesta sessão (docs/fase-atual.md) — este cliente nunca foi exercitado
// contra um servidor real; é verificado só por typecheck. Os endpoints que ele chama são
// implementados no Passo 5 desta mesma fase.
import type { ChecklistItemResponse, EvidenceEnvelope, FieldTask, ServiceType } from "./types";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

export class FieldApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "FieldApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new FieldApiError(response.status, body || `Falha na requisição (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

export function fetchFieldTasks(): Promise<FieldTask[]> {
  return request<FieldTask[]>("/api/field/tasks");
}

export function postTaskCompletion(params: {
  memberId: string;
  taskId: string;
  evidenceHashes: readonly string[];
  responses: readonly ChecklistItemResponse[];
}): Promise<{ ok: true }> {
  return request("/api/field/tasks/complete", { method: "POST", body: JSON.stringify(params) });
}

export function postWorkOrder(params: {
  unitId: string;
  serviceType: ServiceType;
  description: string;
  evidenceEnvelope: EvidenceEnvelope | null;
}): Promise<{ ok: true; workOrderId: string }> {
  return request("/api/field/work-orders", { method: "POST", body: JSON.stringify(params) });
}
