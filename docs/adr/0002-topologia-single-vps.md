# ADR-0002 — Topologia single-VPS e disponibilidade

**Status:** Proposto (Rodada 0) — aguardando "ok"

## Contexto
Toda a stack (web, console, worker, Postgres, Redis, imgproxy, backup) roda em uma única VPS
Contabo até a Fase 5. Banco e aplicação na mesma máquina significa que uma falha de disco pode
levar reservas, ledger, documentos fiscais e evidência de uma só vez.

## Decisão
Assumir alvo de **99,5% de disponibilidade com janela de manutenção anunciada**, não 99,9%.
Separar o banco em VPS própria a partir da Fase 5 ou quando `UNIDADES` passar de ~150.

## Justificativa
VPS única não sustenta 99,9% (reboot de kernel, falha de host e manutenção do provedor derrubam
tudo). Prometer disponibilidade que a topologia não sustenta é pior do que documentar o limite.

## Consequências
- Runbook de DR obrigatório (`/docs/runbook.md`), com RPO ≤5min e RTO 2-4h cronometrado, ensaio
  trimestral de restauração real.
- Gatilho de separação de banco é registrado agora (>150 unidades ou Fase 5), não decidido
  reativamente "quando doer".
- 3-2-1: cópia de backup nunca fica só no mesmo provedor do banco de produção.
