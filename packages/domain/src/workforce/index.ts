export * from "./member";
export * from "./assignment";
// `HashFn` é renomeado no barrel (não no arquivo-fonte) para `AccessCredentialHashFn` — evita
// colisão com o `HashFn` já exportado por `../evidence/chain.ts` no barrel raiz do pacote
// (`src/index.ts`, `export *` de ambos). Os dois tipos continuam estruturalmente idênticos e
// deliberadamente não acoplados (ver comentário de topo de `access-custody.ts`); só o nome de
// exportação pública precisa ser distinto quando os dois convivem no mesmo módulo agregador.
export type {
  AccessCredentialType,
  AccessCredentialEventKind,
  AccessCredentialEvent,
  HashFn as AccessCredentialHashFn,
} from "./access-custody";
export { appendAccessCredentialEvent, verifyAccessCredentialChain, activeCredentialsForMember } from "./access-custody";
export * from "./offboarding";
export * from "./productivity";
