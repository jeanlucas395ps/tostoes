# Tostoes

**Planejamento financeiro compartilhado** para casais e famílias — com clareza entre o que é **previsto** e o que já **aconteceu** de verdade.

Angular no frontend, API PHP enxuta, MySQL no Docker. Sem SaaS obrigatório: rode tudo na sua máquina em minutos.

[![Angular](https://img.shields.io/badge/Angular-19-DD0031?logo=angular&logoColor=white)](https://angular.dev/)
[![PHP](https://img.shields.io/badge/PHP-8.3-777BB4?logo=php&logoColor=white)](https://www.php.net/)
[![MySQL](https://img.shields.io/badge/MySQL-8.4-4479A1?logo=mysql&logoColor=white)](https://www.mysql.com/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Por que o Tostoes?

Apps de finanças pessoais costumam misturar **meta**, **previsão** e **extrato real** na mesma tela. O Tostoes separa isso de propósito:

| Você define | Você confirma | Você enxerga |
|-------------|---------------|--------------|
| Gastos e recebimentos **fixos** | Pendências do mês em **Movimentos** | **Previsto vs real** no dashboard |
| **Metas** com prazo e parcela | Lançamentos nas **contas** | **Grafo de fluxos** entre bancos e categorias |
| **Planejamentos** (Casa, Viagem…) | Convites por **e-mail** | Extrato, investimentos, categorias |

Ideal para quem quer visão de casal ou família sem planilha infinita.

---

## Stack

```
gastos-app/     → Angular 19 (standalone, signals)
api/            → PHP 8.3 REST + JWT
docker-compose  → MySQL 8.4 + Apache (API)
```

---

## Começar em 3 passos

**Pré-requisitos:** [Docker](https://docs.docker.com/get-docker/), [Node.js](https://nodejs.org/) 20+

```bash
git clone https://github.com/jeanlucas395ps/tostoes.git
cd tostoes

# 1. Ambiente
cp api/.env.example api/.env
cp gastos-app/.env.example gastos-app/.env

# 2. API + banco
docker compose up -d --build

# 3. Frontend
cd gastos-app && npm install && npm start
```

| O quê | Onde |
|-------|------|
| App | http://localhost:4200 |
| API | http://localhost:8090/api |
| MySQL | `localhost:3308` — `root` / `root` — DB `gastos` |

**Login local:** `admin` / `admin` (criado na primeira migração) ou cadastro em `/cadastro`.

O proxy do Angular encaminha `/api` → `http://localhost:8090` automaticamente.

---

## Funcionalidades em destaque

- **Planejamentos compartilhados** — múltiplos membros, convite por e-mail, papéis owner/member
- **Plano do mês** — fixos geram pendências; confirme com um clique em Movimentos
- **Contas bancárias e de investimento** — saldo derivado dos lançamentos
- **Metas financeiras** — valor alvo, prazo, aportes planejados vs confirmados
- **Dashboard anual** — barras previsto/real por mês, metas e investimentos
- **Grafo de contas** — visualização de fluxos (banco → categoria → meta)
- **EUR/BRL** — cotação do dia com fallback manual
- **Perfil** — foto, senha, recuperação por e-mail
- **Tema claro/escuro**

Documentação completa: **[PROJETO.md](PROJETO.md)** · **[FUNCIONALIDADES.md](FUNCIONALIDADES.md)**

---

## Estrutura do repositório

```
tostoes/
├── gastos-app/          # Frontend Angular
├── api/
│   ├── src/             # Controllers, services, router
│   ├── database/        # schema.sql + migrations
│   ├── scripts/         # migrate.php, reset-data.php, …
│   └── deploy/          # Pacote opcional para PHP compartilhado (cPanel)
├── docker-compose.yml
└── README.md
```

---

## API (amostra)

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/api/auth/login` | Login JWT (30 dias) |
| `POST` | `/api/auth/register` | Cadastro |
| `GET` | `/api/plannings` | Planejamentos do usuário |
| `POST` | `/api/plannings/{id}/invites` | Convidar por e-mail |
| `GET` | `/api/invites/{token}` | Preview do convite |
| `GET` | `/api/dashboard/summary` | Resumo anual |
| `GET` | `/api/month-plan` | Plano do mês |

---

## Deploy (opcional)

- **Frontend:** Vercel — `Root Directory` = `gastos-app`, variável `API_URL` apontando para sua API pública.
- **API:** qualquer host PHP 8.3 + MySQL — veja [api/deploy/DEPLOY-ALPHA-MEDIA.md](api/deploy/DEPLOY-ALPHA-MEDIA.md).

---

## Scripts úteis

```bash
docker compose logs -f api      # logs da API
docker compose down -v          # para tudo e apaga volume do MySQL
php api/scripts/reset-data.php  # zera lançamentos (mantém usuários)
```

---

## Contribuindo

Issues e PRs são bem-vindos. Para mudanças maiores, abra uma issue antes para alinharmos o escopo.

1. Fork → branch → commit → PR  
2. Mantenha `.env` fora do Git (use os `.env.example`)  
3. Teste localmente com `docker compose up` + `npm start`

---

## Licença

[MIT](LICENSE) — use, modifique e compartilhe à vontade.

---

<p align="center">
  <sub>Feito com foco em clareza financeira familiar — sem lock-in de nuvem.</sub>
</p>
