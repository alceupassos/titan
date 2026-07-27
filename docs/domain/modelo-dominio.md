# Modelo de domínio — Rodada 0

Diagramas iniciais dos agregados centrais e das duas máquinas de estado mais críticas (I9 e I2/I6).
Este documento é ponto de partida para o subagente `domain-modeler` na Fase 0 (proprietário de
`packages/domain`, zero I/O) — não é o modelo final, que ganha entidades completas, eventos de
domínio e testes que violam cada invariante.

## 1. Agregados e relações principais

```mermaid
erDiagram
    TENANT ||--o{ PROPERTY : owns
    PROPERTY ||--o{ UNIT : contains
    UNIT ||--o{ RESERVATION : "stay daterange"
    UNIT ||--o{ RATE_PLAN : priced_by
    UNIT ||--|| UNIT_STATE : "state machine (I9)"
    RESERVATION ||--o{ LEDGER_ENTRY : generates
    RESERVATION ||--o| FISCAL_DOCUMENT : "issues (I7)"
    RESERVATION }o--|| CHANNEL : "originates from"
    RESERVATION ||--o{ PAYMENT_INTENT : "authorizes/captures (I2)"
    UNIT ||--o{ HOUSEKEEPING_TASK : "turnover"
    HOUSEKEEPING_TASK ||--o{ EVIDENCE : "captures (I10)"
    HOUSEKEEPING_TASK }o--|| CHECKLIST_TEMPLATE : "versioned snapshot"
    UNIT ||--o{ WORK_ORDER : "opens"
    WORK_ORDER }o--|| VENDOR : "dispatched to"
    WORK_ORDER ||--o{ EVIDENCE : "before/after"
    UNIT ||--o{ STOCK_MOVEMENT : "consumo_tarefa"
    LEDGER_ENTRY }o--|| ACCOUNT : posts_to
    PAYOUT_BATCH ||--o{ LEDGER_ENTRY : settles
    APPROVAL_REQUEST }o--|| PAYOUT_BATCH : gates
    APPROVAL_REQUEST }o--|| FISCAL_DOCUMENT : gates
    OWNER ||--o{ PROPERTY : "ownership_share"
    AGENT_ACTION }o--|| APPROVAL_REQUEST : "proposes (never executes)"
```

## 2. Máquina de estados da unidade (I9)

```mermaid
stateDiagram-v2
    [*] --> ready
    ready --> occupied: check-in (bloqueado se != ready)
    occupied --> dirty: check-out
    dirty --> cleaning: início da tarefa
    cleaning --> clean: camareira declara
    clean --> inspected: Titan confirma
    clean --> rework: reprovado com item específico
    inspected --> ready
    clean --> ready: fora da amostra de inspeção (9.8.5)
    rework --> cleaning
    ready --> blocked: manutenção/dano/obra/uso do proprietário
    occupied --> blocked
    blocked --> ready: override nominal com motivo
```

## 3. Máquina de estados do pagamento (I2/I6)

```mermaid
stateDiagram-v2
    [*] --> created
    created --> authorized
    authorized --> captured
    captured --> settled
    settled --> refunded
    settled --> partially_refunded
    authorized --> disputed
    disputed --> charged_back
    disputed --> settled: disputa vencida
```

## 4. Bounded contexts (referência — seção 6 do prompt único)

`identity` · `inventory` · `availability` · `rates` · `booking` · `distribution` · `payments` ·
`ledger` · `fiscal` · `approvals` · `housekeeping` · `evidence` · `supply` · `vendors` ·
`workforce` · `crm` · `pricing_intel` · `owner_portal` · `analytics`.

Cada um mapeia para `packages/<contexto>/` na Fase 0, com `CLAUDE.md` próprio declarando o que é
proibido naquele pacote e por quê (ex.: `packages/evidence/CLAUDE.md` proíbe qualquer rota de
exclusão — I10; `packages/domain/CLAUDE.md` proíbe qualquer import de I/O).
