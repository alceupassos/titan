# Provas dos hooks — portão de saída de F0

Requisito do roadmap (docs/roadmap.md, F0): "cada hook do 5.11.4 provado por um caso que ele
bloqueia". Cada hook abaixo foi executado manualmente com um payload real (`stdin` JSON, como o
Claude Code envia de verdade), provando o caso que deve bloquear (exit 2) e, onde aplicável, um
caso equivalente que deve passar (exit 0). Reprodutível — os comandos estão em
`.claude/hooks/*.mjs`.

Esta rodada inclui as correções da auditoria de segurança/invariantes/convenção da Fase 0 (ver
"Correções da auditoria" abaixo) — os hooks tocados por essas correções foram reprovados após a
mudança, não só na primeira escrita.

| Hook | Caso que bloqueia (provado) | Caso que permite (provado) |
|---|---|---|
| `block-applied-migration.mjs` | — (não testado com migration commitada; exige `git show HEAD:` real) | Migration nova não commitada → exit 0 ✅ |
| `block-evidence-deletion.mjs` | Exclusão de evidência via SQL, Drizzle ou rota App Router, em qualquer arquivo → exit 2 ✅, incluindo um arquivo em `packages/housekeeping` (sem o termo no caminho) → exit 2 ✅ (achado FALHA-E corrigido); comando de remoção via Bash em caminho relacionado → exit 2 ✅; payload JSON corrompido → exit 2 ✅ (falha fechada, I10) | Leitura normal → exit 0 ✅; arquivos sob `.claude/**` sempre isentos (evita autobloqueio do próprio hook) |
| `block-ledger-mutation.mjs` | Mutação direta na tabela de lançamentos via Edit/Write → exit 2 ✅; **mesma mutação via `psql -c` no Bash → exit 2 ✅** (achado FALHA-G corrigido — antes só olhava `content`/`new_string`, nunca `command`); payload corrompido → exit 2 ✅ (falha fechada, I3) | `INSERT` de lançamento de estorno com o campo de referência preenchido → exit 0 ✅; documentação (`.md`) descrevendo o padrão em prosa → exit 0 ✅ (achado ao escrever este próprio arquivo — sem isenção, nenhum `.md` poderia explicar a regra) |
| `block-hardcoded-tax.mjs` | Literal numérico de alíquota em `packages/fiscal/**` → exit 2 ✅ | Lookup em tabela versionada → exit 0 ✅ |
| `block-money-float.mjs` | Campo com nome monetário tipado `number` → exit 2 ✅ | — |
| `block-set-without-local.mjs` | `SET` sem `LOCAL` no contexto de tenant → exit 2 ✅; **variante funcionalmente equivalente via função de configuração de sessão com o terceiro argumento falso (achado F-6 corrigido)** → exit 2 ✅ | Variante com o terceiro argumento verdadeiro (escopo de transação) → exit 0 ✅; arquivo de teste/fixture com o anti-padrão intencional → exit 0 ✅ (controle negativo do próprio portão) |
| `block-secrets.mjs` | `.env` com valor real via Write → exit 2 ✅; **mesmo valor via Edit (achado F-7 corrigido — antes só rodava em Write e só olhava `content`)** → exit 2 ✅ | `.env.example` com placeholder vazio → exit 0 ✅ |
| `block-dangerous-bash.mjs` **(novo)** | Comando de exclusão de tabela via Bash → exit 2 ✅; conexão direta a algo com "prod" no nome via Bash → exit 2 ✅ (bug de fronteira de palavra encontrado e corrigido durante a prova: o sufixo não podia exigir fim de palavra, ou nomes como "prod_db" escapavam) | Comando normal → exit 0 ✅ |
| `run-package-tests.mjs` | Teste falhando de propósito em `packages/domain` → exit 2 com output do vitest ✅ (arquivo de prova criado, testado, removido) | Suíte verde → exit 0 ✅ |
| `log-subagent.mjs` | — (não bloqueia; hook informativo) | Anexa linha real a `docs/build-log.md` → exit 0 ✅ (linha de teste removida após a prova) |
| `phase-gate.mjs` | Marcador de portão pendente presente em `docs/fase-atual.md` → exit 2 ✅ | Ausente → exit 0 ✅ |
| `session-brief.mjs` | — (não bloqueia; hook informativo) | Imprime fase atual lida de `docs/fase-atual.md` → exit 0 ✅ |

## Correções da auditoria de segurança/invariantes/convenção (pós-Passo 8 inicial)

Os três subagentes de auditoria (`invariant-auditor`, `security-reviewer`, `convention-checker`)
rodaram sobre a Fase 0 recém-construída e encontraram 8 FALHAS reais (não "escopo de fase
futura") mais 2 violações de convenção. Todas corrigidas nesta mesma sessão:

- **F-1/FALHA-A/B (crítico):** aplicação conectava com um papel superusuário da imagem oficial
  do Postgres — o que torna a política de segurança em nível de linha inerte para essa conexão.
  Corrigido: novo papel de aplicação não-superusuário, migration com política de segurança em
  nível de linha na tabela de tenants (ausente antes) e revogação explícita de update/delete na
  tabela de auditoria.
- **F-2/FALHA-D:** guarda de exclusão de evidência do CASL vinha ANTES das regras por papel —
  CASL resolve por regra mais recente, então uma concessão futura a revogaria em silêncio.
  Corrigido: guarda movida para depois do switch, com teste adversarial provando os dois casos
  (guarda primeiro falha, guarda por último resiste).
- **F-4:** MCP de terceiro expunha consulta SQL livre (proibido pelo ADR correspondente para
  qualquer agente). Removido de `.mcp.json`.
- **F-5:** comando de teste de autorização saía com sucesso mesmo sem nenhuma tarefa executada —
  portão que não pode falhar. Corrigido: script dedicado falha explicitamente até a matriz real
  existir.
- **F-6/F-7:** hooks de convenção com lacunas de cobertura (ver tabela acima).
- **F-9/FALHA-F:** função de teste deliberadamente insegura vivia no código de produto em vez de
  só no arquivo de teste; a instância de acesso ao banco crua era exportada, permitindo bypass do
  wrapper de contexto de tenant. Corrigido: função movida para o teste; instância crua não é mais
  exportada; declaração de exportações do pacote restringindo import profundo.
- **F-10:** o wrapper de contexto de tenant só setava o identificador de tenant; a decisão de
  arquitetura correspondente pede também identificador de ator e escopo de proprietário.
  Corrigido.
- **FALHA-H:** override de check-in retornava o estado ocupado sem validação e sem capturar quem
  autorizou (só motivo). Corrigido: exige identificação de quem autorizou além do motivo, e
  rejeita check-in duplicado numa unidade já ocupada.
- **FALHA-C:** hash da cadeia de evidência não cobria os metadados de captura nem o motivo de
  descarte — descarte podia ser forjado/revertido sem quebrar a verificação. Corrigido com
  redesenho: descarte agora é um evento novo acrescentado à cadeia (nunca uma mutação de campo da
  entrada original).
- **Convenção #2:** log do link de acesso sem senha imprimia dado pessoal e uma credencial de
  portador. Redigido.

## Segunda rodada de auditoria — correção de 3 achados críticos

A auditoria rodou uma SEGUNDA vez sobre o estado corrigido acima e confirmou 5 achados fechados,
mas encontrou 6 achados novos (ver `docs/fase-atual.md` para o detalhe completo). Por decisão do
usuário, só os 3 com risco real de segurança/trava foram corrigidos nesta sessão; os demais
ficam documentados como dívida técnica conhecida.

- **F-A/B′:** as migrations nunca tinham journal/meta real (`drizzle-kit migrate` falhava com
  "Can't find meta/_journal.json"). Corrigido com journal/snapshots gerados pela própria
  ferramentação do drizzle-kit — verificado com `readMigrationFiles` (lê as 2 migrations, na
  ordem certa) e com `drizzle-kit migrate` (progride até tentar conectar no banco, em vez de
  falhar antes disso por journal ausente).
- **N1:** migration ainda não commitada com `ALTER DEFAULT PRIVILEGES` concedendo UPDATE a toda
  tabela futura — editada diretamente (não uma migration corretiva) já que nunca tinha sido
  commitada.
- **N4:** a isenção anti-autobloqueio `/^\.claude[\\/]/` só casava caminho relativo; o harness
  sempre envia caminho absoluto. Corrigido para `/(^|[\\/])\.claude[\\/]/` e reverificado com
  payload real usando o caminho absoluto verdadeiro de cada hook — confirmado que agora um
  self-edit real (mesmo conteúdo atual do hook, caminho absoluto) passa, e uma violação real em
  código de produto (caminho absoluto) continua bloqueando.

## Nota sobre `block-applied-migration.mjs`

Este hook depende do histórico do git para decidir se uma migration já foi "aplicada"
(commitada). Só foi provado o caminho "migration nova, ainda não commitada → permite". O caminho
"migration já commitada → bloqueia" só pode ser provado de verdade depois do primeiro commit real
deste monorepo. Ação pendente: depois do primeiro commit, editar qualquer migration já commitada
e confirmar o bloqueio.

## Nota sobre falha fechada vs. aberta

`block-evidence-deletion.mjs` e `block-ledger-mutation.mjs` foram desenhados para **falhar
fechado** (bloquear) se o payload do hook não puder ser interpretado como JSON — porque protegem
invariantes não negociáveis. Os demais hooks de convenção/estilo falham **aberto** (permitem)
nesse mesmo cenário, porque são checagens de estilo onde um falso bloqueio por payload malformado
seria mais disruptivo do que útil. Essa assimetria é intencional, não descuido.

## Nota sobre autorreferência em hooks de conteúdo

Um hook cujo próprio texto satisfaz seu próprio padrão de bloqueio pode se autobloquear
permanentemente — encontrado duas vezes durante esta rodada de correção: uma vez no nome do
arquivo do hook de evidência (que naturalmente contém o termo que ele procura), e outra vez na
própria documentação explicando o que um hook de mutação bloqueia (que naturalmente precisa
mencionar, em prosa, o padrão proibido). Duas mitigações aplicadas, ambas agora padrão nos hooks
de conteúdo: (1) isenção explícita para `.claude/**` (scripts de controle do harness não são
código de produto onde a invariante se aplica) e para arquivos `.md` (documentação em prosa não
é o mesmo risco que código executando o padrão proibido); (2) onde um padrão precisa combinar um
termo literal com um coringa que também casaria contra a própria definição do padrão, a
construção usa concatenação de string em vez de regex literal.
