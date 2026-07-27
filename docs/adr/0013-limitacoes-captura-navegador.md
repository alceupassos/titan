# ADR-0013 — Limitações de captura no navegador (plataforma)

**Status:** Proposto (Rodada 0) — aguardando "ok"

## Contexto
"O agente errará por otimismo se estas limitações não estiverem escritas" — regra explícita da
seção 8. Documentar antes de qualquer código de captura em T1/T2.

## Decisão — limitações a respeitar no design
- **iOS Safari não tem Background Sync**: upload só progride em foreground — a tela de conclusão
  precisa avisar o usuário a não fechar o app até confirmar.
- **iOS pode despejar storage de site pouco usado**: mitigar com `navigator.storage.persist()`,
  fila pequena, upload agressivo, aviso de obsolescência.
- **Push no iOS só funciona com PWA instalada**: canal primário de notificação deve ser
  WhatsApp/SMS, não push.
- **Sem chave em hardware no navegador**: nível de garantia trava em A1, nunca A3, para captura
  em T1.
- **Relógio do dispositivo é manipulável**: o servidor sempre compara com seu próprio relógio e
  sinaliza divergência (nunca bloqueia sozinho — ver seção 9.8.2).

## Justificativa
Estas são limitações de plataforma, não de implementação — nenhuma quantidade de código as
remove. Escrevê-las agora evita que o agente prometa (ou implemente) um comportamento que o
navegador não sustenta.

## Consequências
- `packages/evidence/CLAUDE.md` referencia este ADR como guia de captura.
- Testes e2e cobrindo fechamento de app durante upload em progresso.
