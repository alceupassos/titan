# ADR-0006 — Trilha fiscal (NFS-e)

**Status:** Proposto (Rodada 0) — bloqueado pelas perguntas 1 e 2 de `docs/decisoes-de-negocio.md`

## Contexto
Três caminhos possíveis para emissão de NFS-e em São Paulo: (1) WebService municipal direto com
certificado A1 e assinatura XMLDSig; (2) Padrão Nacional (DPS/Ambiente de Dados Nacional), cujo
estágio de adoção por São Paulo precisa ser verificado antes de escolher como via primária; (3)
provedor intermediário (Nuvem Fiscal, PlugNotas, Focus NFe, eNotas, NFE.io). A Reforma Tributária
(EC 132/2023 + LC 214/2025) torna 2026 um ano de transição para CBS/IBS.

## Decisão
Começar pela **via 3 (intermediário)** atrás de uma interface `FiscalGateway` comum
(`issue`/`cancel`/`substitute`/`query`/`fetchPdf`/`fetchXml`), mantendo a via direta como
otimização de custo em escala futura.

## Justificativa
Reduz risco de manutenção de layout/certificado durante a Fase 4; a direção da adoção do Padrão
Nacional em SP e da transição CBS/IBS ainda está instável para comprometer uma integração direta
desde o início.

## Consequências
- `tax_rules` versionada por vigência (`valid_from`/`valid_to`) desde o primeiro schema — nunca
  hardcode de alíquota/código/retenção.
- Guarda WORM de 5 anos para XML/PDF fiscal.
- **Bloqueado até resposta às perguntas 1 (regime: locação vs. hospedagem) e 2 (quem emite a
  nota)** — sem isso, o sujeito passivo do ISS não está definido.
