# Runbook de pagamentos

Fonte: `prompt.md` seção 9.4.1 (sete camadas de controle) e `docs/adr/0005-orquestracao-de-pagamentos.md`.
Este documento é checklist **operacional** — configuração de painel de gateway e processo humano,
não código. Nenhum item aqui é implementável em `packages/payments`; é o complemento que faz a
Camada 0 valer de verdade.

## Camada 0 — nunca sacar do gateway (não-negociável)

Antes de processar a primeira transação real em qualquer gateway (Asaas, Stripe):

- [ ] Configurar liquidação automática (*auto-settlement*) para **uma única conta bancária
      pré-cadastrada da Titan** — nunca uma conta escolhida em tempo de execução.
- [ ] **Desabilitar toda API de transferência/saque** no painel do gateway (ou usar uma chave de
      API restrita sem escopo de payout, onde o gateway suportar chave restrita por função).
- [ ] Confirmar por teste manual no painel (não por código) que uma tentativa de saque via API
      falha com erro de permissão.
- [ ] Documentar aqui, por gateway, a data da configuração e quem confirmou:

| Gateway | Conta de liquidação configurada | Saque via API desabilitado | Confirmado por | Data |
|---|---|---|---|---|
| Asaas   | _pendente_ | _pendente_ | — | — |
| Stripe  | _pendente_ | _pendente_ | — | — |

## Camada 1 — checklist do lado do gateway

- [ ] Chaves de API separadas por ambiente (sandbox vs. produção), nunca reaproveitadas.
- [ ] MFA com passkey em todo painel de gateway (não só senha/TOTP).
- [ ] Allowlist de IP amarrada aos IPs de saída da VPS de produção (quando o gateway suportar).
- [ ] Separação entre quem acessa o painel do gateway e quem detém a credencial de produção
      (segredo vive em `.env`/secret manager da VPS, nunca compartilhado por chat/e-mail).
- [ ] Segredo de assinatura de webhook rotacionado periodicamente.
- [ ] Conta bancária de destino travada, alterável só no painel com MFA — nunca por API.

## Contatos de emergência (a preencher quando as contas reais existirem)

| Gateway | Suporte/emergência | Como revogar chave | Como congelar repasses |
|---|---|---|---|
| Asaas   | _pendente_ | _pendente_ | _pendente_ |
| Stripe  | _pendente_ | _pendente_ | _pendente_ |
| Banco (conta de liquidação) | _pendente_ | _pendente_ | _pendente_ |

## Passo a passo de contestação (chargeback)

_Pendente — preencher quando o primeiro chargeback real ocorrer ou quando a documentação vigente
de cada gateway for revisada linha a linha (seção 9.3 marca capacidades de antifraude/disputa como
"a validar contra a documentação vigente")._

## Kill switch de pagamentos

_Pendente — mecanismo de congelamento de repasses/pagamentos em incidente (Camada 7 da seção
9.4.1). Depende de `packages/payments` e da fila de aprovações terem execução real contra conta
de gateway viva; não implementável nesta rodada sem credenciais reais._

---

**Nota de escopo (Fase 2):** este runbook nasce como esqueleto nesta fase porque não há conta
real Asaas/Stripe configurada ainda nesta máquina/organização. Os itens `_pendente_` acima
bloqueiam qualquer processamento de pagamento real em produção — sandbox de desenvolvimento pode
prosseguir sem eles, produção não pode.
