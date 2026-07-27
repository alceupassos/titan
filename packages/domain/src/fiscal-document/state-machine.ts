// I7 — Documento fiscal emitido não é editável; apenas cancelado/substituído.
import { canTransition, transition, type Transitions } from "../fsm";

export type FiscalDocumentStatus = "draft" | "issued" | "cancelled" | "substituted";

const FISCAL_DOCUMENT_TRANSITIONS: Transitions<FiscalDocumentStatus> = {
  draft: ["issued"],
  issued: ["cancelled", "substituted"], // terminal quanto a EDIÇÃO — só estados-fim
  cancelled: [],
  substituted: [],
};

export function canTransitionFiscalDocument(
  from: FiscalDocumentStatus,
  to: FiscalDocumentStatus,
): boolean {
  return canTransition(FISCAL_DOCUMENT_TRANSITIONS, from, to);
}

export function transitionFiscalDocument(
  from: FiscalDocumentStatus,
  to: FiscalDocumentStatus,
): FiscalDocumentStatus {
  return transition(FISCAL_DOCUMENT_TRANSITIONS, from, to);
}

export class FiscalDocumentImmutableError extends Error {
  constructor() {
    super(
      "Documento fiscal emitido não pode ser editado (I7). Use cancelamento ou substituição, " +
        "nunca uma edição in-place.",
    );
    this.name = "FiscalDocumentImmutableError";
  }
}

/** I7 em função pura: uma vez `issued`, o único jeito de "mudar" o documento é criar um evento
 * de cancelamento ou substituição — nunca reescrever campos do documento original. */
export function assertNotEditingIssuedDocument(status: FiscalDocumentStatus, attemptedOp: "edit" | "cancel" | "substitute"): void {
  if (status === "issued" && attemptedOp === "edit") {
    throw new FiscalDocumentImmutableError();
  }
}
