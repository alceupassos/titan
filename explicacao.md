# Titan Stay — o que já foi construído (explicação para quem não é programador)

Este documento explica, em linguagem simples, o que já existe no sistema da Titan hoje, como
cada parte vai funcionar quando estiver 100% pronta, o que ainda é só "demonstração" (dado de
mentirinha para mostrar como vai ficar) e o que falta decidir ou contratar para virar realidade.

Ele segue o documento original do projeto (`PROMPT_UNICO_Titan.md`) — que é a "planta baixa"
técnica completa — mas traduzido para o dia a dia de quem vai usar e tomar decisões de negócio,
não de quem vai programar.

**Onde ver isso ao vivo agora:** https://titan.giannasiadvogados.com.br (peça o login com o
sócio que está tocando a parte técnica).

---

## 1. A ideia em uma frase

Um sistema único para tocar toda a operação de aluguel por temporada da Titan: reservas (vindas
do site próprio e do Airbnb/Booking/VRBO/Expedia), o dinheiro entrando e saindo, a nota fiscal,
a limpeza com foto de prova, e — mais para frente — um "robô" que ajuda a sugerir preço e
responder hóspede, mas que **nunca decide sozinho** nada que envolva dinheiro ou nota fiscal sem
uma pessoa confirmar.

## 2. Como o sistema é dividido (as "portas de entrada")

Existem 3 portas diferentes, cada uma para um tipo de pessoa:

1. **Cockpit (staff)** — é onde a equipe da Titan (você, financeiro, operação) trabalha o dia
   inteiro. É o que este documento detalha abaixo, menu por menu.
2. **Portal do Proprietário** — uma tela mais simples para o dono do imóvel acompanhar quanto
   a unidade dele rendeu, ver o extrato de repasse e a nota fiscal. Já mostra números calculados
   corretamente (comissão do mês, unidades sob gestão, extratos de repasse), mas ainda com dado
   de demonstração — falta banco real e falta a trava de "esse proprietário só vê a própria
   unidade" (hoje veria as unidades de todo mundo, ver seção 8).
3. **Portal do Prestador** — para quem presta serviço pra Titan (diarista, técnico de manutenção)
   ver as ordens de serviço dele e o quanto tem a receber. Este já tem telas reais funcionando.

Existe também uma 4ª porta para o **hóspede** (um site de vendas, tipo o que ele veria no
Booking, mas da própria Titan): página de cada unidade, checkout, confirmação de reserva — o
código já existe e já foi construído, mas **não está publicado neste site de demonstração**
(só o cockpit está no ar hoje). O checkout dele já sabe criar a reserva e chamar o pagamento,
mas como ainda não há conta real no Asaas/Stripe (seção 6.2), qualquer tentativa de pagamento
cai numa tela de "pendente de integração" — comportamento esperado, não um bug.

## 3. Os logins de acesso já criados

Para você testar o cockpit agora, já existem 3 contas:

| Quem usa | Onde entra | Login |
|---|---|---|
| Você / dono do negócio | Cockpit inteiro (staff) | `admin@titan.preview` |
| Proprietário de imóvel (teste) | Portal do Proprietário | `dono@titan.preview` |
| Conta de teste geral | Cockpit | `hospede@titan.preview` |

(As senhas foram enviadas separadamente no chat com o sócio técnico — evite deixar circulando,
são contas de demonstração, não de produção real.)

**Importante:** hoje, qualquer uma dessas 3 contas tem o mesmo nível de acesso completo — ainda
não existe a trava de "esse usuário só pode ver isso, aquele só pode ver aquilo". Isso é uma das
coisas que falta construir (ver seção 8).

---

## 4. Menu por menu — o que cada tela faz

### 4.1 Bloco "Operação" (o dia a dia da equipe)

- **Dia** — a tela que abre quando a equipe loga: quem chega hoje, quem sai hoje, o que está
  pendente. *Hoje é um esqueleto* — a estrutura está lá, mas ainda não puxa dado real do banco.

- **Calendário** — o "mapa" visual de todas as unidades e reservas, tipo uma planilha de hotel
  onde você vê cada unidade numa linha e os dias nas colunas, com barras coloridas por canal
  (direto, Airbnb, Booking, VRBO, Expedia). *Construído e funcionando com dado de exemplo.*
  Dá pra arrastar uma reserva para mudar a data.

- **Unidades** *(criado agora, a seu pedido)* — a ficha de cada studio: tamanho, capacidade,
  preço atual, histórico de ocupação, e a "pesquisa de preço de mercado" (explicada em detalhe
  na seção 5). Hoje mostra os 4 studios que você pediu (506, 609, 312, 409) com **dado de
  demonstração** — os números são realistas, mas fabricados para mostrar como a tela vai
  funcionar. Quando o banco de dados ganhar campos reais de metragem/capacidade (hoje só existe
  nome e status da unidade), essa tela passa a mostrar o studio de verdade.

- **Reservas** — lista de todas as reservas, com linha do tempo de cada uma (pagamento,
  mensagens, quem mexeu). A tela de lista ainda mostra os dados de exemplo (as 32 reservas
  fictícias que criamos para teste). Já existe um banco de dados real ligado no servidor (o
  mesmo que guarda os logins) e criar uma reserva nova em "Reservas → Nova" já grava de verdade
  ali — falta trocar as telas de listagem para lerem desse banco real em vez do exemplo fixo.

- **Limpeza / Checklists / Serviços técnicos** — o quadro de limpeza (unidade suja → limpando →
  limpa → inspecionada), o editor da lista de tarefas que a camareira segue, e as ordens de
  serviço técnico (ex.: conserto de ar-condicionado). Cada limpeza exige **foto como prova** —
  o sistema já sabe recusar um check-in numa unidade que não foi inspecionada (regra dura, não
  dá pra "pular"). *Telas construídas; falta decidir o vínculo da equipe de limpeza (CLT, PJ ou
  terceirizada — pergunta 3 pendente, ver seção 8) antes de ligar isso à folha de pagamento.*

- **Estoque** — controle de enxoval (lençol, toalha) por unidade, avisando quando está na hora
  de comprar mais. *Já calcula sozinho quando repor, mas com números de exemplo.* Decisão já
  tomada: o enxoval é do **proprietário do imóvel**, não da Titan — o sistema já reflete isso.

- **Prestadores / Equipe / Escala / Produtividade** — cadastro de quem presta serviço pra Titan,
  escala de quem trabalha quando, e um placar simples de produtividade. *Telas construídas com
  dado de exemplo.*

### 4.2 Bloco "Comercial" (preço e distribuição)

- **Tarifas** — onde se define o preço de cada unidade por período (alta temporada, baixa
  temporada, restrição de estadia mínima).

- **Pricing** — o "cérebro de preço": compara sua unidade com o mercado, olha o histórico de
  ocupação e sugere um preço pra noite, sempre respeitando um piso mínimo (nunca vender abaixo
  do custo). Explicado em detalhe na seção 5 abaixo, porque é a parte que você pediu para
  detalhar mais.

- **Distribuição** — o painel de saúde dos canais (Airbnb, Booking, VRBO, Expedia): mostra se
  está tudo sincronizado ou se alguma reserva não bateu. **Este é o coração da integração com
  os canais externos — ver seção 6.**

- **Inbox** — caixa de entrada única de mensagem (site, WhatsApp, e-mail, e depois as OTAs).
  *A tela existe, mas hoje é só uma casca vazia ("nenhuma conversa nesta fase") — nenhum canal de
  mensagem real está ligado ainda. É a próxima peça a construir de verdade neste bloco.*

### 4.3 Bloco "Financeiro"

- **Financeiro** — o livro-caixa da empresa: toda entrada e saída de dinheiro fica registrada
  em dupla entrada (cada real que sai de algum lugar entra em outro — é o jeito contábil correto
  de nunca "perder" ou "inventar" dinheiro no sistema).

- **DRE** — o resultado (lucro/prejuízo) do período, calculado automaticamente a partir do
  livro-caixa acima, nunca digitado à mão.

- **Fiscal** — fila de emissão de nota fiscal (NFS-e) de cada reserva, com o cofre onde as notas
  ficam guardadas (por lei, notas fiscais não podem ser apagadas, só canceladas com motivo).
  *Já decidido: é a Titan que emite a nota (não o dono do imóvel), no regime de "hospedagem com
  serviços". Falta: confirmação formal do contador antes de emitir nota de verdade, e a conta
  real no provedor de nota fiscal (Focus NFe — ver seção 6).*

- **Repasses** — o fechamento de quanto cada proprietário recebe no mês, com aprovação em duas
  etapas para qualquer repasse acima de R$ 5.000 (uma pessoa sozinha nunca pode mandar dinheiro
  sozinha acima desse valor — trava de segurança).

- **Aprovações** — a fila central onde qualquer coisa que precise de "ok" de uma pessoa (um
  reembolso, um repasse grande, uma ação que o robô de IA sugeriu) fica esperando aprovação.
  Isso existe justamente para que **nada financeiro ou fiscal aconteça sozinho**, nem por engano,
  nem por decisão de robô.

### 4.4 Bloco "Sistema"

- **Automação** — o painel do "robô" de atendimento (explicado na seção 7).
- **Configurações** — onde ficará o cadastro de usuários, permissões, alíquotas de imposto e as
  chaves de integração (senhas de API dos canais/gateways). *Ainda não construída de fato.*

---

## 5. Como funciona a "pesquisa de comparação de preços" (pricing)

Você pediu para detalhar isso, então aqui vai em miúdos, sem termo técnico:

1. **Passo 1 — encontrar concorrentes parecidos.** O sistema olha as outras unidades (as suas
   próprias e, no futuro, dados de mercado) e escolhe as mais parecidas com a que você quer
   precificar — mesmo tipo (studio), capacidade parecida, preço na mesma faixa. Isso é o "comp
   set" (conjunto comparável). Hoje ele compara pelas 3 outras unidades da carteira mais 5
   concorrentes de mercado **fictícios** (inventados só para mostrar como o gráfico fica).
2. **Passo 2 — olhar quanto essa unidade costuma ficar ocupada.** Olha os últimos meses e enxerga
   um padrão (ex.: fim de semana costuma lotar, meio de semana não).
3. **Passo 3 — calcular o preço mínimo que não dá prejuízo.** Soma o custo de limpar, repor
   enxoval, taxa de canal e cartão, e coloca uma margem mínima de lucro em cima — esse é o
   **piso**. O sistema nunca sugere um preço abaixo disso.
4. **Passo 4 — sugerir o preço final.** Junta tudo (concorrência + ocupação esperada + piso) e
   sugere um valor, sempre mostrando o "porquê" em português simples (ex.: "sugerido R$ 441,60
   porque a mediana do mercado é R$ 322,50 e este fim de semana tem procura 43% acima da média").
5. **Prova histórica (backtest).** Ele testa, contra um período passado simulado, se esse jeito
   de precificar teria dado mais receita do que simplesmente deixar um preço fixo. Hoje esse
   teste roda com noites de exemplo, não com o histórico real da Titan ainda.

**O que falta para virar "de verdade":** (a) o banco de dados precisa ganhar os campos reais de
metragem e capacidade de cada unidade (hoje não existem — só nome e status); (b) a comparação de
mercado hoje é só entre as suas próprias unidades — para comparar com concorrentes reais fora da
Titan, seria necessário contratar uma fonte de dados de mercado licenciada (nunca "raspar" sites
de concorrente sem autorização — isso é proibido pelo próprio projeto, é ilegal/arriscado).

---

## 6. As integrações — o que conecta com o quê

Esta é a pergunta mais importante do documento: **hoje, nada disso está de fato conectado com o
mundo real ainda.** Todo o código já está escrito e pronto pra plugar, mas falta abrir/configurar
as contas reais em cada serviço. Ponto por ponto:

### 6.1 Canais de venda (Airbnb, Booking, Expedia, VRBO)

- **Já confirmado com você:** a Titan já tem contrato/conta ativa nos 4 canais.
- **Como vai funcionar:** para 3 deles (Booking, Expedia, VRBO) existe uma via oficial de
  integração (API), mas ela exige certificação da própria plataforma, que **demora meses** para
  ser aprovada — não depende só de nós.
- **Airbnb é o caso especial:** o Airbnb não abre API pública pra ninguém de fora do programa de
  parceiros oficial (que também demora meses/anos pra entrar). Por isso, o projeto vai usar, por
  enquanto, um "robô" que entra no painel do Airbnb como se fosse você mesmo navegando (mesma
  senha da conta da Titan) para atualizar preço/disponibilidade. **Risco real e assumido por
  você:** isso tecnicamente viola os termos de uso do Airbnb, mesmo usando a conta própria da
  Titan — o risco é a conta ser suspensa. Você já foi avisado disso antes e decidiu seguir mesmo
  assim; só reforçando aqui por escrito.
- **O que já existe pronto:** o "encanamento" que recebe a disponibilidade via iCal (um formato
  de calendário que todo canal exporta, sem precisar de aprovação nenhuma) já funciona e evita
  reserva dobrada. O que falta é ligar a conta real de cada canal nessa tubulação.
- **O que falta:** nenhuma chamada real ainda foi testada com conta de verdade — está tudo
  testado só com dado simulado. Falta o sócio técnico configurar as credenciais reais de cada
  canal no servidor.

### 6.2 Pagamento (como o hóspede paga)

- **Já decidido:** dois provedores — **Asaas** (para Pix e cartão nacional, e também para pagar
  os repasses aos proprietários) e **Stripe** (para hóspede estrangeiro pagando com cartão
  internacional).
- **O que já existe pronto:** todo o "encanamento" de receber o pagamento, confirmar, e lançar no
  livro-caixa já está escrito e testado com dado simulado.
- **O que falta:** abrir as contas de verdade no Asaas e na Stripe e colocar as chaves reais no
  servidor. Sem isso, todo checkout hoje cai numa tela de "pagamento pendente de integração" —
  que é o comportamento esperado, não um bug.

### 6.3 Nota fiscal (NFS-e)

- **Provedor escolhido:** Focus NFe (um intermediário que conversa com a prefeitura por nós, em
  vez de integrar direto com o webservice do governo — mais simples e mais barato de manter).
- **O que já existe pronto:** a fila de emissão, o cofre de guarda da nota (nunca se apaga nota
  fiscal, só cancela com motivo) e a lógica de qual imposto cobrar.
- **O que falta:** (1) confirmação formal do contador de que o regime tributário está certo;
  (2) abrir conta real no Focus NFe; (3) as alíquotas de imposto usadas hoje são só exemplo,
  precisam ser confirmadas pelo contador antes de emitir nota real.

### 6.4 Robô de atendimento (Inteligência Artificial)

- **Princípio inegociável:** o robô **propõe**, nunca **executa** sozinho nada que envolva
  dinheiro ou nota fiscal. Toda ação dele que tenha esse tipo de consequência cai na fila de
  Aprovações (seção 4.3) esperando um humano confirmar.
- **O que já existe pronto:** a estrutura de segurança (o robô nunca ganha permissão de escrever
  se estiver lendo uma mensagem não confiável — proteção contra "injeção de instrução" por um
  hóspede mal-intencionado tentando enganar o robô via mensagem) e um "robô" de teste simples
  (baseado em palavra-chave, não é uma inteligência artificial de verdade ainda).
- **O que falta:** ligar num provedor de IA de verdade (tipo Claude, GPT) — hoje ele só reconhece
  6 tipos de pergunta por palavra-chave (ex.: "qual a senha do wifi"), pra provar que a trava de
  segurança funciona, não para atender hóspede de verdade ainda.

---

## 7. O robô de atendimento — resumindo simples

Pense nele como um estagiário muito disciplinado: ele pode responder perguntas simples de
hóspede (senha de wifi, horário de check-in) e até **sugerir** um reembolso ou uma mudança de
preço — mas ele nunca aperta o botão de "confirmar" um pagamento, uma nota fiscal ou qualquer
coisa que mexa em dinheiro de verdade. Isso sempre cai pra uma pessoa aprovar na fila de
Aprovações. Hoje ele existe só como uma prova de conceito (mecanismo de segurança testado), não
como um atendente de verdade ainda — falta contratar acesso a um provedor de IA real.

---

## 8. Decisões de negócio que ainda faltam (só você/sócios podem responder)

Estas perguntas já foram feitas e respondidas ao longo do projeto, **exceto uma**:

| # | Pergunta | Status |
|---|---|---|
| 1 | Regime: locação pura ou hospedagem com serviço? | ✅ Respondida: hospedagem com serviço |
| 2 | Quem emite a nota, Titan ou o dono do imóvel? | ✅ Respondida: a Titan emite |
| 3 | Vínculo da camareira/equipe de limpeza (CLT, PJ, terceirizada)? | ⏳ **Ainda pendente** — precisa de decisão jurídica |
| 4 | Quem paga cada custo operacional (limpeza, manutenção)? | ✅ Respondida, configurável por contrato de cada proprietário |
| 5 | Valores-limite de aprovação (repasse, reembolso, compra)? | ✅ Parcialmente — repasse acima de R$5.000 exige dupla aprovação |
| 6 | Já existe contrato com algum canal/agregador? | ✅ Respondida: contrato direto nos 4 canais, sem agregador terceirizado |
| 7 | O enxoval é da Titan ou do proprietário? | ✅ Respondida: do proprietário |
| 8 | Quais gateways de pagamento usar? | ✅ Respondida: Asaas + Stripe |

A pergunta 3 (vínculo da equipe de limpeza) **trava** a parte de escala/pagamento da equipe até
ser respondida — hoje o sistema trata o nome de quem limpa como texto livre, sem vínculo formal
nenhum, exatamente para não presumir uma resposta que só o jurídico pode dar.

---

## 9. O que falta, em ordem de prioridade, para isto rodar "de verdade"

1. **Deixar o servidor pronto para valer** — hoje o site já roda numa máquina real na internet
   (Contabo), com banco de dados de verdade (é ele que guarda os 3 logins e a reserva que você
   criar em "Reservas → Nova"), mas foi montado às pressas para você poder ver e testar: ainda
   não tem backup automático configurado, nem aviso automático se cair, nem senha própria
   trocada regularmente. A maioria das telas ainda mostra dado de exemplo fixo em vez de ler
   desse banco real — isso é o próximo passo técnico, não uma decisão de negócio.
2. **Contas reais abertas** — Asaas, Stripe, Focus NFe, e as credenciais de cada canal
   (Airbnb/Booking/Expedia/VRBO). Sem isso, o sistema simula tudo, mas não processa nada de
   verdade.
3. **Confirmação do contador** — sobre o regime fiscal e as alíquotas de imposto usadas.
4. **Resposta jurídica** — sobre o vínculo da equipe de limpeza (pergunta 3 acima).
5. **Campos que faltam no cadastro de unidade** — metragem, capacidade, categoria (hoje só
   existe nome e status; é rápido de adicionar, mas precisa ser feito antes da tela de
   "Unidades" e do "Pricing" usarem dado real em vez de exemplo).
6. **Vínculo de "quem é quem"** — hoje, qualquer pessoa que faça login tem acesso a tudo; falta
   construir a trava de "esse usuário só é dono do imóvel X" ou "esse é só operação, não vê
   financeiro".
7. **Publicar o site de vendas do hóspede** (`apps/web`) — o código já existe (unidade,
   checkout, confirmação), só falta publicá-lo num endereço próprio e ligar o pagamento real;
   hoje o hóspede só chega pelos canais externos neste ambiente de demonstração.
8. **Robô de IA real** — contratar acesso a um provedor de IA (o mecanismo de segurança já está
   pronto, só falta "ligar o cérebro" de verdade).

---

## 10. Resumo de uma frase por área

- **Reservas e calendário:** funcionando com dado de exemplo, falta banco de produção real.
- **Unidades (nova):** pronta, com os 4 studios que você pediu, dado de demonstração.
- **Preço/pricing:** o "cérebro" já calcula sozinho, falta plugar dado de mercado real.
- **Canais (Airbnb etc.):** encanamento pronto, falta abrir/plugar as contas reais.
- **Pagamento:** encanamento pronto, falta abrir conta no Asaas/Stripe.
- **Nota fiscal:** encanamento pronto, falta conta no Focus NFe + aval do contador.
- **Financeiro/repasse:** funcionando com trava de aprovação dupla, falta banco real.
- **Limpeza/evidência:** funcionando, trava vínculo da equipe (pergunta jurídica pendente).
- **Robô de IA:** mecanismo de segurança pronto, falta contratar o "cérebro" de IA de verdade.
- **Quem-pode-ver-o-quê:** ainda não existe de verdade — todo login vê tudo hoje.
