# Gastos , controle financeiro

App Angular + API PHP + MySQL. Inspirado no Mobills, com separação clara por mês: **Ganhos**, **Custos** e **Investimentos**.

Documentação completa do produto e de todas as funcionalidades: **[PROJETO.md](PROJETO.md)**.

## Estrutura

| Pasta | Descrição |
|-------|-----------|
| `gastos-app/` | Frontend Angular |
| `api/` | API REST PHP |
| `docker-compose.yml` | MySQL 8 + API PHP (Apache) |

## Subir com Docker (recomendado)

Na raiz do projeto:

```bash
cp api/.env.docker.example api/.env.docker   # primeira vez
docker compose up -d --build
```

| Serviço | URL / porta |
|---------|-------------|
| API | http://localhost:8090/api |
| MySQL | `localhost:3308` (user `root`, senha `root`, DB `gastos`) |

### API na Alpha Media (produção)

Pacote `public_html` para cPanel: [api/deploy/DEPLOY-ALPHA-MEDIA.md](api/deploy/DEPLOY-ALPHA-MEDIA.md)

```bash
cd api/deploy && ./build-public_html.sh
# Envie todo o conteúdo de api/deploy/out/ para public_html no servidor
```

Na primeira subida a API executa `migrate.php` (schema + migrações). Usuário inicial opcional via `SETUP_USER` / `SETUP_PASSWORD` no `.env`, ou cadastro em `/cadastro`.

```bash
docker compose logs -f api    # logs da API
docker compose down           # parar
docker compose down -v        # parar e apagar volume do MySQL
```

### Frontend

```bash
cd gastos-app
cp .env.example .env   # API_URL=http://localhost:8080/api
npm install
npm start
```

Abra http://localhost:4200 e faça login (cadastro em `/cadastro` ou usuário definido no `SETUP_*` do `.env`).

## Frontend na Vercel

1. No projeto Vercel, defina **Root Directory** = `gastos-app`.
2. O `vercel.json` já configura build e SPA (`dist/gastos-app/browser`).
3. Variável de ambiente (opcional, já é o padrão no build):

   `PROD_API_URL` = `https://api.tostoes.com.br/api`

4. Na API em produção, configure `CORS_ORIGIN` com a URL do site (ex.: `https://tostoes.com.br`).

Build local de produção:

```bash
cd gastos-app && npm run build
```

## Sem Docker (opcional)

```bash
php api/scripts/migrate.php
cd api/public && php -S localhost:8080 router.php
```

## Endpoints principais

- `POST /api/auth/login`
- `GET /api/dashboard/summary?year=2026`
- `GET|POST|PUT|DELETE /api/transactions`
- `GET /api/investment-types`
- `GET|POST /api/projections`

## Regras de negócio

- **Dashboard**: totais **reais** dos lançamentos (ganhos, custos, investimentos).
- **Projeções**: tabela `monthly_projections` (metas/planejado) , comparadas no dashboard.
- **Investimentos**: cada aporte pode ter tipo (Reserva, Apartamento, Capitalização).

Veja o progresso em [CHECKLIST.md](CHECKLIST.md).
