# Product

## Register

brand

## Platform

web

## Users

Primary: o hóspede — alguém pesquisando e reservando uma estadia de temporada, navegando em
poucos minutos entre um resultado de busca e o cartão de crédito, quase sempre no celular, com
zero contexto prévio sobre a Titan Empreendimentos além do que esta página mostra. Secundário:
o mesmo hóspede voltando depois da reserva para conferir a confirmação, e — em fases futuras —
criando conta via magic-link para acompanhar reservas passadas. Este NÃO é o cockpit
(`apps/console`, registro `product`, uso interno de equipe Titan por 8h/dia): é a vitrine pública
da mesma empresa, avaliada em segundos, sem treinamento e sem tolerância para fricção.

## Product Purpose

O storefront direto (`apps/web`) da Titan Stay: um hóspede busca datas, vê unidades disponíveis,
recebe uma cotação transparente calculada no servidor (nunca inventada no cliente — mesma
disciplina de `packages/domain/src/quote/quote.ts` usada pelo cockpit), e conclui o checkout com
PIX ou cartão sem que nenhum dado de cartão passe pela nossa aplicação (I4 — tokenização/hosted
fields do gateway). Sucesso aqui é a métrica de conversão de um canal direto de verdade: menos
dependência de comissão de OTA, e uma reserva que já nasce com o mesmo lastro financeiro auditável
do resto da operação (o `reservation_id` gerado aqui alimenta o mesmíssimo ledger/fiscal do
cockpit).

## Positioning

Um canal direto que parece tão confiável quanto reservar num hotel internacional conhecido, mas
com o calor de quem está apresentando uma casa de verdade — nunca um formulário genérico de
booking engine de terceiros. A Titan aparece como marca no rodapé e no cabeçalho (mesma empresa do
cockpit), mas a superfície de conversão tem identidade visual própria: luz, hospitalidade,
fotografia de ambiente — o oposto deliberado da "torre de controle" escura e densa que a equipe
Titan usa por trás das cortinas.

## Brand Personality

Acolhedor, confiável, direto ao ponto. Fala como quem já hospedou centenas de famílias e conhece
cada detalhe da unidade — nunca como um marketplace impessoal nem como uma landing page de
performance agressiva ("últimas vagas!", contadores regressivos, pop-ups). O preço mostrado é
sempre o preço final da diária × noites, sem letra miúda escondida — a mesma ética de "número
provavelmente correto" do cockpit, só que expressa aqui como simplicidade para o hóspede, não como
densidade de auditoria.

## Anti-references

- Clone genérico de booking engine de terceiro (visual de "software de reserva de pousada"
  intercambiável entre qualquer operador) — precisa parecer a Titan, não um template.
- Marketplace tipo Airbnb/Booking com grade infinita de cards idênticos e fotografia de estoque —
  a Titan vende um número pequeno e curado de unidades, a página deve refletir isso.
- Landing page de growth-hacking agressivo — contador regressivo falso, pop-up de saída, prova
  social inventada, "3 pessoas estão vendo esta unidade agora" sem dado real por trás.
- O cockpit escuro e denso (`PRODUCT.md`/`DESIGN.md` da raiz) — registro errado para este
  contexto de marketing/conversão; um hóspede não deveria sentir que caiu numa ferramenta interna.

## Design Principles

1. **O preço nunca surpreende.** A cotação mostrada na página da unidade é a mesma calculada
   server-side e recalculada no checkout (`packages/domain` `createQuote`/`priceStay`) — nenhuma
   taxa aparece do nada entre a busca e o pagamento nesta fase.
2. **Confiança sem frieza.** Herdamos do cockpit a ideia de que todo número tem lastro (reserva
   real, ledger real por trás), mas a expressão visual aqui é luz e hospitalidade, não densidade
   de auditoria — o hóspede não precisa ver a maquinaria.
3. **Rápido de decidir, rápido de reservar.** Poucos passos entre busca e confirmação; nenhum
   campo pedido que não seja necessário para emitir a reserva e a nota fiscal.
4. **Nenhum dado de cartão nesta aplicação.** Checkout por cartão usa hosted fields/tokenização
   do gateway (I4) — o formulário desta app nunca renderiza um campo de número de cartão.
5. **Curadoria, não catálogo.** Um número pequeno de unidades bem apresentadas supera uma grade
   infinita — cada unidade é tratada como um lugar real, com nome e caráter, não um SKU.

## Accessibility & Inclusion

WCAG 2.2 AA como piso, não aspiração — mesmo padrão do cockpit (`axe-core` quando o pipeline de
Storybook/CI chegar a esta app). Contraste mínimo 4.5:1 em corpo de texto, 3:1 em texto grande;
todo estado (disponível/indisponível, sucesso/erro de pagamento) pareado com texto, nunca só cor;
alvos de toque grandes no fluxo de checkout mobile — a maior parte do tráfego de busca de temporada
é celular, em uma mão, muitas vezes decidindo rápido antes de embarcar ou durante o planejamento de
viagem.
