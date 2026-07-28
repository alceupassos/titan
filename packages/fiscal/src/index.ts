// Barrel do pacote @titan/fiscal (Fase 4 — docs/roadmap.md). Reexporta a porta comum (`port.ts`)
// e o adapter concreto Focus NFe (`focus-nfe/`) — mesmo padrão de `packages/payments/src/index.ts`.
export type { CancelInvoiceResult, FiscalGateway, FiscalInvoiceStatusQuery } from "./port";
export { FiscalGatewayError } from "./port";

export type { FocusNfeAdapterConfig } from "./focus-nfe/adapter";
export { createFocusNfeAdapter } from "./focus-nfe/adapter";

export type { FiscalDocumentKind, FiscalStorageRef, FiscalVault, StoreFiscalDocumentParams } from "./vault/port";
export { FiscalDocumentAlreadyStoredError } from "./vault/port";
export type { LocalFileFiscalVaultConfig } from "./vault/local-file-vault";
export { createLocalFileFiscalVault } from "./vault/local-file-vault";
