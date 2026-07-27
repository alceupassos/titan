# Anti-padrões a rejeitar

Fonte: `prompt.md` / `PROMPT_UNICO_Titan.md`, seção 11 — lista literal. Qualquer PR ou faixa que
introduzir um destes é FALHA de portão, não sugestão de estilo.

1. Preço calculado ou validado no cliente.
2. Disponibilidade como booleano por dia, sem tipo de intervalo (`daterange`)/constraint no banco.
3. Dado financeiro como tabela única de "entra/sai" sem contrapartida de dupla entrada.
4. Emissão de nota fiscal síncrona dentro da requisição de checkout.
5. `if canal == 'airbnb'` espalhado no domínio em vez de adapters.
6. Alíquota, código de serviço, regra de retenção ou prazo de canal como constante de código.
7. Webhook processado sem verificação de assinatura ou sem deduplicação.
8. `SET` sem `LOCAL` para contexto de tenant sob PgBouncer.
9. Float para dinheiro; timestamp UTC para data de estadia.
10. Scraping de OTA (Airbnb/Booking) apresentado como "pesquisa de preço" sem autorização.
11. Modelo de ML em produção sem versionamento ou monitoramento de drift.
12. Foto tratada como mero "anexo" em vez de evidência com proveniência e nível de garantia (A0–A3).
13. Reprovar um serviço sem apontar item específico do checklist.
14. Consequência financeira decidida por modelo de IA sem confirmação humana registrada.
15. Aprovação de valor monetário por botão de chat ("botão de Telegram não é controle interno").
16. Saque de gateway para conta bancária habilitado via API.
17. Backup mantido só na mesma VPS; documento fiscal mantido só em disco local.
18. Segredo commitado em `.env`; PII em log; PAN (número de cartão) em qualquer lugar.
19. Qualquer papel com rota para excluir evidência.
20. Invariante existindo só como instrução do `CLAUDE.md` quando poderia ser hook de bloqueio ou constraint de banco.
21. Duas faixas de trabalho paralelas escrevendo no mesmo diretório.
22. Achado de auditoria/checklist de portão corrigido na faixa de integração em vez de devolvido à faixa causadora.
23. Subagente auditor com permissão `Edit` — quem relata não conserta.
