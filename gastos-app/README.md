# Gastos , Controle financeiro pessoal

App Angular para substituir a **Folha 2** da sua planilha: gastos reais por dia, em R$ ou €, com balanço cruzando receitas planejadas (Folha 1) e saídas reais (Folha 2).

## Início rápido

```bash
cp .env.example .env
# Edite AUTH_USER e AUTH_PASSWORD no .env

npm install
npm start
```

Abra http://localhost:4200 e entre com as credenciais do `.env`.

## Estrutura

| Rota | Função |
|------|--------|
| `/dashboard` | KPIs, gráficos e tabela de balanço |
| `/folha-1` | Receitas e despesas **estimadas** (como a planilha original) |
| `/folha-2` | Lançamentos **reais** , alimentam o balanço de saídas |
| `/configuracoes` | Câmbio EUR→BRL, backup JSON, reset |

## Autenticação

Credenciais em `.env` (não commitar). O script `scripts/generate-env.mjs` roda antes de `npm start` / `npm build` e gera `src/environments/environment.ts`.

## Dados

Tudo em `localStorage` (chave `gastos-app-data`). Use **Exportar JSON** nas configurações para backup.

O checklist completo do projeto está em [`../CHECKLIST.md`](../CHECKLIST.md).
