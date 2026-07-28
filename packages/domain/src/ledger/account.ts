// Plano de contas do ledger de dupla entrada (I2/I3). Zero I/O: `Account` aqui é só o shape —
// a tabela real (com o versionamento por tenant) nasce em packages/db no Passo 2 desta fase.

export type AccountKind = "asset" | "liability" | "equity" | "revenue" | "expense";

export interface Account {
  readonly id: string;
  readonly tenantId: string;
  readonly code: string;
  readonly name: string;
  readonly kind: AccountKind;
}
