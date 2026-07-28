# Decisões de negócio — verdade sobre o negócio

Este arquivo é a fonte de verdade citada pelo `CLAUDE.md` raiz (regra 7 do prompt único: "se ele
não existir, pergunte antes de assumir"). Está em esqueleto: contém as 8 perguntas de maior
impacto da Rodada 0, com a recomendação padrão que o agente assume **apenas para poder continuar
planejando**, nunca para produção sem confirmação.

**Nenhuma resposta aqui está confirmada até o usuário editar este arquivo ou responder
diretamente.** A Fase 0 pode abrir com as respostas pendentes, mas a Fase 4 (Fiscal) e a Fase 6
(Limpeza/Evidência, para o desenho de `workforce/`) **não podem fechar o portão de saída** sem as
perguntas 1–3 respondidas.

---

## 1. Regime da operação

**Pergunta:** Locação por temporada pura (LC 8.245/91, até 90 dias) ou hospedagem com serviços
(LC 116/2003 item 9.01)?

**Resposta:** confirmada — **hospedagem com serviços** (LC 116/2003, item 9.01: limpeza
recorrente, enxoval, gestão profissional). Respondida ao abrir a Fase 4 (docs/roadmap.md).
**Ainda precisa de confirmação formal do contador antes de produção real** — a resposta aqui
libera o desenho e a implementação do módulo fiscal, não substitui a validação contábil.

## 2. Quem emite a nota

**Pergunta:** Titan (prestadora de serviço de hospedagem) ou o proprietário (locador)?

**Resposta:** confirmada — **a Titan emite** a NFS-e, como prestadora do serviço de hospedagem
perante o hóspede (não o proprietário do imóvel). Respondida ao abrir a Fase 4. Mesma ressalva:
precisa de confirmação formal do contador/jurídico antes de produção real.

## 3. Vínculo da camareira

**Pergunta:** CLT, PJ ou terceirizada?

**Resposta:** _pendente_ — o usuário recusou responder diretamente ao ser perguntado na abertura
da Fase 6 ("Ainda não decidido / perguntar ao jurídico", 2026-07-27) e, questionado sobre como
proceder dado o bloqueio, optou explicitamente por seguir com o default abaixo em vez de esperar
ou de eu presumir uma resposta que só o jurídico pode dar.

**Default assumido enquanto pendente:** nenhum — `workforce/` fica com os dois desenhos
(`employee` e `contractor`) especificados em paralelo até a resposta, sem implementar nenhum.
**Consequência real na Fase 6** (docs/roadmap.md): nenhum bounded context de vínculo foi
modelado; `cleaning_tasks.assigned_to` é texto livre, sem vínculo formal, e o checklist funciona
só como especificação de escopo de serviço, nunca como controle de jornada (seção 9.10.6). Segue
bloqueando o portão de saída da Fase 9 (Pessoas e Campo) até ser respondida.

## 4. Contrato de administração — quem paga o quê

**Pergunta:** comissão, amenities, material de limpeza, enxoval, manutenção até que valor,
depreciação — quem paga cada item?

**Resposta:** confirmada, em duas partes — respondida ao abrir a Fase 5 (docs/roadmap.md):
1. **Comissão:** percentual fixo sobre a receita bruta de hospedagem (não sobre receita líquida
   pós-taxas de canal/gateway) — modelo mais simples de auditar no ledger.
2. **Itens operacionais** (material de limpeza, enxoval, manutenção, amenities): **configurável
   por contrato de proprietário**, não um modelo único global. Cada proprietário pode ter um dos
   dois arranjos: (a) Titan paga tudo, embutido na comissão — extrato simples, sem rateio linha a
   linha; ou (b) proprietário paga, Titan rateia e desconta do repasse — exige o item completo
   como linha de despesa no extrato individual daquele proprietário. **Implica que o modelo de
   dados de `packages/ledger`/`administration_contract` precisa de um campo por proprietário
   (ou por unidade) que escolhe entre os dois arranjos, nunca uma constante global de código.**

## 5. Alçadas de aprovação

**Pergunta:** valores-limite para compra sem cotação, OS sem orçamento prévio, reembolso sem
step-up, repasse com dupla aprovação, ajuste de estoque.

**Resposta:** parcialmente confirmada, ao abrir a Fase 5:
- **Repasse com dupla aprovação:** acima de **R$ 5.000** por lote/repasse individual exige duas
  aprovações distintas com step-up (Camada 2/3 da seção 9.4.1).
- **Compra/OS sem cotação prévia:** até **R$ 100** — abaixo disso, equipe de campo/prestador pode
  agir sem esperar aprovação formal.

**Ainda pendente:** limite de reembolso sem step-up, limite de ajuste de estoque sem aprovação —
usar limites conservadores de exemplo até serem confirmados, documentados explicitamente como
não confirmados em qualquer lugar do código/UI que os exiba.

## 6. Contrato existente com OTA/agregador

**Pergunta:** já existe contrato com alguma OTA ou agregador (Hostaway, Guesty, Beds24, Rentals
United, NextPax, Lodgify) hoje?

**Resposta:** confirmada — a Titan **já tem contrato/conta real** com Airbnb, Booking, VRBO e
Expedia (não o cenário "sem contrato" assumido pelo default do ADR-0004). **Não** será usado
agregador terceirizado (Hostaway/Guesty/Beds24/etc.) — a Titan constrói seu próprio agregador em
`packages/channels`, com iCal como backbone seguro para os 4 canais e uma automação via
navegador (Playwright) especificamente para o Airbnb, cobrindo o que o iCal não alcança
(tarifas/reservas estruturadas, já que o Airbnb não tem API pública sem aprovação de meses no
Partner Program). Respondida ao abrir a Fase 3 (docs/roadmap.md).

**Risco assumido explicitamente pelo usuário:** a automação via navegador no painel de host do
Airbnb tipicamente viola os Termos de Serviço da plataforma, mesmo usando a conta própria da
Titan — risco real de suspensão de conta, não uma questão puramente técnica. Perguntado
diretamente antes de prosseguir; o usuário confirmou que quer construir mesmo assim. Ver
`docs/adr/0020-automacao-navegador-canais.md` para o registro completo da decisão e das
mitigações de design (que reduzem impacto, não eliminam o risco).

## 7. Propriedade do enxoval

**Pergunta:** enxoval é da Titan ou do proprietário?

**Resposta:** _pendente_

**Default assumido enquanto pendente:** Titan (ativo circulante em rotação), sujeito a correção
antes do portão da Fase 7.

## 8. Gateways de lançamento (F2)

**Pergunta:** quais dois gateways começam a operação?

**Resposta:** confirmada — **Asaas** (PIX/BRL) + **Stripe** (hóspede estrangeiro), conforme
default sugerido pela seção 15 item 13 do prompt único. Respondida ao abrir a Fase 2
(docs/roadmap.md). Sem conta/credenciais reais de sandbox ainda configuradas nesta máquina — os
adapters da Fase 2 são construídos contra o contrato documentado de cada provedor, prontos para
plugar quando as contas existirem.

---

## Itens 9–14 (seção 15 do prompt único) — recomendação padrão, não bloqueiam a Rodada 0

| # | Decisão | Recomendação padrão | Confirmar antes de |
|---|---|---|---|
| 9 | Quem inspeciona a limpeza | Gestor pelas fotos no cockpit, com amostragem de risco (9.8.5) | Portão F6 |
| 10 | Vistoria de chegada compartilhada com o hóspede | Sim — reduz disputa, exige fotos impecáveis | Portão F6 |
| 11 | Geolocalização de equipe/prestador | Só no instante da captura, sem rastreamento, comunicado com transparência | Portão F6 |
| 12 | Evidência mínima para retenção de caução | Exigir A2 (não aceitar A1) | Portão F6 |
| 13 | Quem escreve os checklists | Titan monta a ferramenta; o padrão é do usuário + camareira mais experiente | Portão F6 |
| 14 | Tape chart — construir ou licenciar | Construir em canvas próprio; reavaliar comercial só se o esforço estourar (ADR-0018) | Portão F1 |
