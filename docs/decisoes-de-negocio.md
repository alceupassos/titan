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

**Resposta:** _pendente_

**Default assumido enquanto pendente:** hospedagem com serviços (cenário típico com limpeza
recorrente, enxoval e gestão profissional). **Precisa de confirmação do contador antes do portão
da Fase 4.**

## 2. Quem emite a nota

**Pergunta:** Titan (prestadora de serviço de hospedagem) ou o proprietário (locador)?

**Resposta:** _pendente_

**Default assumido enquanto pendente:** nenhum — bloqueia o desenho de `packages/fiscal` além do
esqueleto de porta (`FiscalGateway`).

## 3. Vínculo da camareira

**Pergunta:** CLT, PJ ou terceirizada?

**Resposta:** _pendente_

**Default assumido enquanto pendente:** nenhum — `workforce/` fica com os dois desenhos
(`employee` e `contractor`) especificados em paralelo até a resposta, sem implementar nenhum.

## 4. Contrato de administração — quem paga o quê

**Pergunta:** comissão, amenities, material de limpeza, enxoval, manutenção até que valor,
depreciação — quem paga cada item?

**Resposta:** _pendente_

**Default assumido enquanto pendente:** nenhum — é a especificação literal do extrato de repasse;
sem isso, `ledger/` não fecha o portão da Fase 5.

## 5. Alçadas de aprovação

**Pergunta:** valores-limite para compra sem cotação, OS sem orçamento prévio, reembolso sem
step-up, repasse com dupla aprovação, ajuste de estoque.

**Resposta:** _pendente_

**Default assumido enquanto pendente:** limites conservadores de exemplo (a definir em conjunto
com o usuário antes da Fase 0 fechar `packages/approvals`).

## 6. Contrato existente com OTA/agregador

**Pergunta:** já existe contrato com alguma OTA ou agregador (Hostaway, Guesty, Beds24, Rentals
United, NextPax, Lodgify) hoje?

**Resposta:** _pendente_

**Default assumido enquanto pendente:** nenhum contrato existente — ADR-0004 segue com iCal +
agregador a escolher na Fase 3.

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
