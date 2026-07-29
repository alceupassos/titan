# Plano robusto — tarefas marcadas com `@@` em explicacao2.md

## Contexto

Você anotou pedidos de funcionalidade direto no `explicacao.md` (copiado para `explicacao2.md`),
marcando cada um com `@@`. São 8 grupos de pedidos, espalhados por 6 seções do documento. Este
arquivo é o plano de como cada um vai ser construído — investiguei o estado real do código antes
de escrever, porque vários pedidos pareciam simples na superfície mas esbarram em limitações
técnicas/contratuais reais (ex.: "tempo real" com Airbnb não é tecnicamente possível hoje) ou em
lacunas de dado que precisam ser resolvidas primeiro (ex.: não existe contagem de hóspedes em
nenhuma tabela ainda).

**Formato:** um bloco por grupo de pedido — o que foi pedido (citando a linha `@@`), o que a
investigação encontrou de real no código, como vai ser construído, arquivos principais, e
limitações/riscos a aceitar antes de começar. No final, a ordem recomendada e as decisões que só
você pode tomar.

## Achados que valem para vários grupos ao mesmo tempo

- **Não existe envio de WhatsApp em nenhum lugar do sistema hoje.** O "Hermes" (o robô que já
  roda no servidor com um canal de WhatsApp conectado) é um serviço separado — a única forma seria
  criar uma "ferramenta" nova e bem restrita que o Hermes pode chamar, nunca um envio solto direto
  do cockpit.
- **Não existe contagem de hóspedes nem hora de check-in/checkout em nenhuma reserva ainda.** Hoje
  só se sabe a data (dia 10 a dia 12), nunca a hora, nem quantas pessoas. Isso trava 3 dos 8
  grupos até ser resolvido.
- **Nenhum canal (Airbnb/Booking/VRBO/Expedia) permite "avisar" a gente automaticamente quando
  algo muda** — a única forma de saber é ficar checando de tempos em tempos (hoje a cada 3
  minutos para o Airbnb). "Tempo real" de verdade exigiria aprovação oficial da própria
  plataforma, que leva meses e não depende de nós.
- **A automação que mexe no painel do Airbnb hoje é hipotética — nunca foi testada contra a tela
  de verdade do Airbnb.** Qualquer coisa nova que dependa dela (ex.: puxar fotos/descrição do
  anúncio) herda esse mesmo risco de quebrar quando o Airbnb mudar o site deles.
- **A tela de "Reservas" hoje está mais crua do que o `explicacao.md` dava a entender** — não é
  "dado de exemplo", é uma tela ainda vazia mesmo. Isso muda a ordem de prioridade do Grupo E.

---

## Grupo A — Integração com Airbnb/Booking: "tempo real" + espelhar informação + tela de conferência

**Pedido:** integração em tempo real com os bancos de dados do Booking/Airbnb; puxar o máximo de
informação possível para o cockpit parecer visualmente com o Booking; uma tela onde o sistema
tenta puxar tudo do Airbnb/Booking e você confere/corrige/completa.

**Realidade técnica (importante alinhar expectativa antes de começar):** "tempo real" não é
alcançável hoje por nenhum dos dois — Booking/Expedia/VRBO exigem aprovação oficial da própria
plataforma (meses, fora do nosso controle) para qualquer conexão de verdade; o Airbnb não abre
isso pra ninguém de fora do programa de parceiros dele (também meses). O que já existe hoje
funciona checando de poucos em poucos minutos, nunca na hora exata que algo muda lá. Vou
construir para "atualiza sozinho a cada poucos minutos", não para "instantâneo" — e vou deixar
isso visível na tela, para não prometer o que a própria plataforma externa não permite.

**Como construir (3 passos):**
1. **Ensinar o sistema a trazer mais informação do anúncio.** Hoje só trazemos o nome da unidade,
   nada de foto/comodidade/descrição/preço. Isso precisa ser ensinado no "robô" que já entra no
   painel do Airbnb — e como esse robô nunca foi testado contra a tela de verdade, este passo
   PRECISA de uma sessão real no painel do Airbnb pra gravar como ele se comporta, antes de
   colocar em uso de verdade.
2. **Tela "Importar do canal".** Uma tela nova, dentro de cada unidade, que mostra lado a lado
   "o que veio do Airbnb/Booking" e "o que está cadastrado aqui", com um botão por informação
   para você aceitar, corrigir ou ignorar — nunca grava sozinho sem você confirmar (mesmo
   princípio de todo o resto do sistema: o robô propõe, a pessoa decide).
3. **Visual parecido com o Booking.** Isso é decisão de design, não de dado — trago como sugestão
   visual (cores por canal já existem), mas não vou copiar a marca visual do Booking (risco de
   marca registrada); a ideia de "familiaridade" (mesma estrutura de informação, mesmas cores por
   canal) é aplicável, um clone visual não é recomendável.

**Risco a aceitar:** o mesmo já aceito para atualizar preço/disponibilidade no Airbnb — o robô
pode quebrar quando o Airbnb mudar o site deles, e essa automação tecnicamente viola os termos de
uso do Airbnb. Vale para este uso novo também.

---

## Grupo B — Página "Dia": horário de checkout, quem vai arrumar, aviso automático por WhatsApp

**Pedido:** mostrar horário de checkout e quem vai arrumar; verificar quantos hóspedes ficarão na
próxima hospedagem e avisar a prestadora via WhatsApp quantas toalhas colocar, com lembrete de
verificar papel higiênico e limpeza de micro-ondas/frigobar.

**Realidade técnica:** travado por duas informações que ainda não existem em nenhuma reserva
(quantidade de hóspedes; hora exata de chegada/saída — hoje só se sabe o dia) e pela falta de
qualquer forma de mandar WhatsApp automaticamente hoje.

**Como construir (em ordem, cada passo destrava o próximo):**
1. Ensinar o sistema a guardar quantos hóspedes vêm em cada reserva.
2. Ensinar o sistema a guardar horário (não só data) de chegada/saída, para o hóspede poder
   avisar uma chegada exata.
3. Construir a tela "Dia" de verdade — hoje ela é só um esqueleto vazio.
4. Criar a "ponte" com o WhatsApp: uma ferramenta nova e estreita que o Hermes pode chamar só
   pra mandar esse aviso específico (telefone da prestadora + quantas toalhas + o lembrete fixo),
   nunca uma porta aberta pra qualquer mensagem.

**Decisão que preciso de você antes de construir:** qual é a régua de "quantas toalhas por
hóspede"? (ex.: 1 toalha de banho por pessoa + 1 de rosto). Isso é regra do seu negócio, não
técnica — prefiro perguntar a inventar um número.

---

## Grupo C — Calendário: prévia ao passar o mouse + prioridade de limpeza + regra de early check-in

**Pedido:** ao passar o mouse sobre a unidade, mostrar o status real dela + um botão de "avisar
prioridade" quando o hóspede confirmou que chega no horário exato do check-in, ou quando o early
check-in foi autorizado; se o early check-in foi pago, a unidade precisa estar pronta até as 9h.

**Realidade técnica:** a prévia ao passar o mouse já existe (mostra canal, datas, status, preço)
— é melhoria, não construção do zero. Falta: mostrar o status REAL da unidade (limpa/suja/
inspecionada) dentro dessa prévia, e o conceito de "early check-in pago ou não" não existe ainda
em lugar nenhum.

**Como construir:**
1. Reaproveita a contagem de hóspedes/horário do Grupo B — sem isso, não dá pra saber "confirmou
   chegada no horário do check-in".
2. Guardar se o early check-in foi pedido, se foi pago, e quem autorizou.
3. Regra simples: se foi pago, o prazo de limpeza vira 9h da manhã, sempre.
4. Mostrar o status real da unidade na prévia + o botão de prioridade, que usa a MESMA ferramenta
   de WhatsApp do Grupo B (não cria uma segunda forma de mandar mensagem).

---

## Grupo D — Checklist da prestadora: reaproveitamento de roupa de cama + item sumido

**Pedido:** interface para a prestadora confirmar a higienização com data/hora/quem fez (**essa
parte já existe, funcionando de verdade**); avaliar se a roupa de cama pode ser reaproveitada;
dizer quantas toalhas/roupas está levando pra lavar; apontar item sumido (copo, sanduicheira,
travesseiro) para cobrança ou reposição.

**Realidade técnica — a parte mais fácil e mais rápida deste plano inteiro:** o registro de
data/hora/quem fez **já existe e já funciona de verdade**, gravado pelo aplicativo de campo. O
"motor" de checklist já é flexível o bastante pra receber os itens novos sem precisar reconstruir
nada. O tipo de movimento de estoque "perda" (pra item sumido) **já existe** também.

**Como construir:**
1. Adicionar ao checklist os itens novos: "roupa de cama pode ser reaproveitada?", "quantas
   toalhas está levando?", "sumiu algum item? qual?" — sempre como uma NOVA versão do checklist
   (nunca editando o que já está em uso).
2. Quando a resposta for "sumiu item", isso já dispara automaticamente um registro de "perda" no
   estoque — sem precisar de tela nova, só conectando dois pedaços que já existem.
3. Reaproveitamento de roupa de cama não precisa de nada novo no banco de dados — é só mais uma
   pergunta no checklist, cujo efeito é "não contar essa peça como suja" na hora de calcular
   quanto foi consumido.
4. Pra "cobrar de quem" o item sumido, vou usar um campo genérico que já existe pra guardar esse
   contexto (reserva + de quem cobrar), sem precisar de tabela nova.

---

## Grupo E — Reservas: consolidar, filtrar por data, exportar, planejar receita/despesa

**Pedido:** consolidar reservas passadas/futuras, filtrar por data, exportar relatório,
planejamento de receita/despesa.

**Realidade técnica — corrige uma imprecisão do `explicacao.md`:** a tela de Reservas não tem
"dado de exemplo" como eu tinha escrito antes — ela está mesmo vazia hoje, sem nenhuma reserva
aparecendo. Este grupo precisa **construir a listagem de verdade primeiro**, antes de filtro ou
exportação.

**Como construir (em ordem):**
1. **Listagem de verdade** — puxar as reservas reais do banco de dados, com paginação. Esse é o
   pré-requisito de tudo que vem depois.
2. **Filtro por data** — reusando o mesmo formato de filtro que a tela de DRE (financeiro) já
   usa, pra manter consistência.
3. **Exportar relatório** — hoje não existe nenhum "exportar" em lugar nenhum do sistema; vou
   construir um botão que baixa uma planilha (CSV, abre em Excel/Google Sheets) — mais simples e
   confiável do que gerar PDF.
4. **Planejamento de receita/despesa** — conecta direto com o Grupo F (recebíveis) abaixo; depois
   que aquele existir, esta tela só reaproveita a mesma informação.

---

## Grupo F — Financeiro: contas a receber (recebíveis) com datas previstas

**Pedido:** para reservas com recebimento futuro, mostrar quais são e as datas previstas de
recebimento.

**Realidade técnica:** hoje só existe o lado "a pagar" (fornecedores/prestadores) como uma tela
de verdade — o lado "a receber" (hóspede que ainda vai pagar) ainda não existe como tela própria.

**Como construir:** em vez de criar uma tabela nova e duplicar onde o dinheiro "mora" de verdade
(evitando duas fontes diferentes falarem coisas diferentes sobre o mesmo real), vou calcular essa
lista direto a partir das reservas confirmadas que ainda não tiveram o pagamento recebido —
usando a data de check-in (ou a data combinada de pagamento, se for parcelado) como "previsão de
recebimento". Se no dia a dia aparecer a necessidade real de parcelamento formal (várias parcelas
com datas próprias), aí sim construo uma tabela própria para isso — só quando um caso real pedir,
não adiantado.

---

## Grupo G — Cadastro de prestador: vínculo (CLT/PJ/Terceirizada) + empresa terceirizadora

**Pedido:** caixa de seleção com 3 opções no cadastro do prestador (cada uma tratada de acordo
com o regime), mais um campo para empresa terceirizadora.

**Realidade técnica — a parte mais delicada deste plano, precisa de um alinhamento rápido antes
de eu codificar:** hoje já existem dois "regimes" parecidos no sistema, mas nenhum é exatamente
isso que você pediu — um é só o regime tributário de quem já é PJ/autônomo (usado só pra calcular
imposto retido no pagamento), o outro é o vínculo trabalhista da equipe própria, que está
**travado esperando resposta jurídica sua** (a mesma pergunta pendente sobre CLT/PJ/terceirizada
que já está registrada desde o início do projeto).

**Como construir, sem violar essa decisão ainda pendente:**
1. Adicionar a caixa de seleção (CLT/PJ/Terceirizada) no cadastro — isso é só **capturar** a
   informação, não decidir sozinho a consequência trabalhista dela (que segue esperando resposta
   jurídica, exatamente como já é hoje pra equipe própria).
2. Adicionar o campo de nome da empresa terceirizadora, que só aparece/é obrigatório quando você
   escolhe "Terceirizada".
3. **Não vou ligar isso a cálculo de imposto nem a folha de pagamento ainda** — mesmo cuidado já
   tomado no resto do sistema: guardar o dado, deixar claro o que falta, nunca presumir uma
   resposta jurídica que só você/seu advogado pode dar.

**Pergunta rápida antes de eu codificar:** confirma que, por enquanto, esse campo é só uma
"etiqueta informativa" (não muda cálculo de imposto/pagamento)? É pra eu não passar a falsa
impressão de que a decisão jurídica já foi tomada.

---

## Ordem recomendada de execução

1. **Reservas ganham "quantos hóspedes" e "horário"** — destrava os Grupos B e C juntos.
2. **Grupo E (listagem de verdade em Reservas)** — hoje é o maior buraco (tela vazia), e é
   pré-requisito do Grupo F.
3. **Grupo D (checklist da prestadora)** — mais barato, mais isolado, ganho rápido.
4. **Grupo G (vínculo do prestador)** — isolado, mas espera a conversa rápida de alinhamento
   acima antes de eu codificar.
5. **Grupos B + C (Dia + Calendário + WhatsApp)** — depende do passo 1 e da ferramenta nova de
   WhatsApp (a parte de maior esforço de infraestrutura).
6. **Grupo F (recebíveis)** — depende do Grupo E já existir.
7. **Grupo A (integração Airbnb/Booking)** — o mais caro e o mais arriscado (automação nunca
   testada contra o painel de verdade, risco de conta suspensa); deixo por último e reavalio a
   prioridade depois dos outros 6 grupos — também porque depende de uma sessão real de acesso ao
   painel do Airbnb antes de valer para produção.
