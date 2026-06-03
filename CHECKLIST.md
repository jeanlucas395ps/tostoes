# Checklist , App Gastos

Controle de progresso do app Angular de finanças pessoais (Folha 1 planejada + Folha 2 real).

## Fase 1 , Base (MVP)

- [x] Projeto Angular 19 com rotas e componentes standalone
- [x] API PHP + MySQL (`api/`)
- [x] Login com usuário no banco (JWT)
- [x] Guard de autenticação + interceptor HTTP
- [x] Abas: Relatório, Ganhos, Custos, Investimentos
- [ ] Migrar dados do localStorage antigo para MySQL
- [x] Seed inicial baseado na planilha (receitas, BR, PT, investimentos, lazer)
- [x] Layout com navegação (Dashboard, Folha 1, Folha 2, Configurações)

## Fase 2 , Folha 1 (planejado)

- [x] Tabela mensal de receitas e despesas estimadas
- [x] Filtros por tipo e região (BR / PT / geral)
- [x] CRUD de itens planejados
- [ ] Importar/exportar CSV da planilha original
- [ ] Projeção de investimentos com CDI (como na planilha)
- [ ] Linha "Consegui guardar mais" por mês
- [ ] Duplicar valores do mês anterior em lote

## Fase 3 , Folha 2 (gastos reais)

- [x] Lançamentos com BRL e EUR (conversão configurável)
- [x] Visão calendário por dia do mês
- [x] Visão lista
- [x] Categorias (Brasil, Portugal, Investimentos, etc.)
- [x] Tipo: despesa / investimento / entrada extra / lazer
- [ ] Tags ou subcategorias livres
- [ ] Anexar nota fiscal (foto/link)
- [ ] Busca global por descrição
- [ ] Recorrência automática (copiar assinaturas fixas)

## Fase 4 , Balanço e gráficos

- [x] Receitas da Folha 1 no balanço
- [x] Saídas apenas da Folha 2 (despesas reais)
- [x] Investimentos separados de despesas no dashboard
- [x] Gráfico barras: receitas vs despesas vs investimentos
- [x] Gráfico pizza: categorias (Folha 2)
- [x] Tabela de balanço mensal (com e sem lazer)
- [ ] Comparar real (F2) vs estimado (F1) por categoria
- [ ] Alertas quando gasto real > estimado
- [ ] Meta mensal de poupança vs realizado

## Fase 5 , Investimentos

- [x] Categoria investimento na Folha 2
- [x] Montante inicial configurável
- [ ] Painel patrimônio (Reserva + Apartamento + Capitalização)
- [ ] Rendimento CDI simulado
- [ ] Histórico de aportes extras

## Fase 6 , Qualidade e deploy

- [x] Backup/restauração JSON
- [ ] Testes unitários (serviços de balanço)
- [ ] PWA (uso offline no celular)
- [ ] Deploy (Vercel/Netlify ou servidor próprio)
- [ ] Backend opcional (sync entre dispositivos)

## Como usar agora

1. `cd gastos-app`
2. Copiar `.env.example` → `.env` e definir `AUTH_USER` / `AUTH_PASSWORD`
3. `npm start` → http://localhost:4200
4. Cadastrar gastos reais na **Folha 2**; conferir balanço no **Dashboard**
5. Ajustar estimativas na **Folha 1** quando a planilha mudar

## Regras de negócio (lembrar)

| Conceito | Origem |
|----------|--------|
| Entrada de dinheiro | Folha 1 (planejado) |
| Saída real | Folha 2 (lançamentos) |
| Estimativas de despesa na Folha 1 | Não entram no balanço de saídas |
| Investimento | Folha 2, tipo `investment` , separado de gasto |
| Lazer | Planejado F1; opcional lançar também na F2 |
