# Invariantes — I1 a I10

Fonte: `prompt.md` / `PROMPT_UNICO_Titan.md`, seção 3. Não negociáveis: qualquer violação é FALHA
de portão de fase, auditada por `invariant-auditor` (ver `docs/adr/0019-orquestracao-claude-code.md`).

| # | Invariante | Camada de aplicação |
|---|---|---|
| I1 | Uma unidade nunca tem duas reservas confirmadas com períodos sobrepostos, independentemente do canal | Constraint `EXCLUDE USING gist` no banco (`btree_gist`) + fila serializada por `unit_id` + `SELECT ... FOR UPDATE` entre cotação e confirmação |
| I2 | Toda reserva confirmada tem lastro financeiro rastreável (autorização, captura, liquidação, estorno) | Ledger de dupla entrada + máquina de estados de pagamento (`created → authorized → captured → settled → refunded/charged_back`) |
| I3 | Todo lançamento financeiro é imutável; correção por lançamento de estorno | Append-only + `reversal_of_id`; nenhum `UPDATE`/`DELETE` concedido na tabela de lançamentos |
| I4 | Nenhum dado de cartão trafega ou repousa na aplicação | Tokenização / hosted fields dos gateways. Escopo PCI-DSS SAQ-A. Teste que falha o build se padrão de PAN aparecer em log |
| I5 | Toda mutação de disponibilidade/tarifa é evento versionado e reproduzível | Event log + outbox transacional |
| I6 | Toda chamada de/para webhook é idempotente e com assinatura verificada | `idempotency_key` por intent + dedupe por `event_id` + HMAC/JWS |
| I7 | Documento fiscal emitido não é editável; apenas cancelado/substituído | Estado terminal + trilha de auditoria; natural key persistida antes da chamada ao webservice |
| I8 | Preço publicado em qualquer canal deriva de decisão de pricing rastreável | Snapshot de decisão persistido (inputs, versão do modelo, sugerido, final, aprovador) |
| I9 | Nenhuma unidade recebe check-in fora do estado `ready` (limpa e inspecionada); exceção só por override nominal com motivo | Máquina de estados da unidade acoplada ao check-in; fora de `ready` retira disponibilidade nos canais (ver `docs/domain/modelo-dominio.md`) |
| I10 | Evidência fotográfica nunca é excluída por nenhum papel; apenas marcada como descartada com motivo | `evidence_log` append-only encadeado por hash (`entry_hash = sha256(prev_hash \|\| contentHash \|\| envelope)`); nenhuma rota de exclusão existe para nenhum papel, incluindo `titan.owner` |

## Regra de ouro (seção 5.11.4)

> "Regra em prompt é pedido. Hook é bloqueio."

Toda invariante acima que puder ser expressa como constraint de banco ou hook `PreToolUse`/`PostToolUse`
determinístico **deve** sê-lo antes da Fase 0 fechar. Uma invariante que existe só como texto neste
arquivo é o anti-padrão #20 de `docs/anti-padroes.md`.
