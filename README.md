# Tostoes

**Planejamento financeiro compartilhado** para casais e famílias — previsto vs real, metas, contas e convites por e-mail.

[![Angular](https://img.shields.io/badge/Angular-19-DD0031?logo=angular&logoColor=white)](https://angular.dev/)
[![PHP](https://img.shields.io/badge/PHP-8.3-777BB4?logo=php&logoColor=white)](https://www.php.net/)
[![MySQL](https://img.shields.io/badge/MySQL-8.4-4479A1?logo=mysql&logoColor=white)](https://www.mysql.com/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Começar em 1 comando (API + banco)

**Pré-requisitos:** [Docker](https://docs.docker.com/get-docker/), [Node.js](https://nodejs.org/) 20+

```bash
git clone https://github.com/jeanlucas395ps/tostoes.git
cd tostoes
chmod +x setup.sh && ./setup.sh
```

Depois, o frontend:

```bash
cd gastos-app && npm install && npm start
```

| O quê | Onde |
|-------|------|
| App | http://localhost:4200 |
| API | http://localhost:8090/api |
| Login | **admin** / **admin** |

O `setup.sh` copia `.env.example` → `.env` e sobe MySQL + API. A migração roda automaticamente no container.

---

## Setup manual

```bash
cp api/.env.example api/.env
cp gastos-app/.env.example gastos-app/.env
docker compose up -d --build
cd gastos-app && npm install && npm start
```

---

## O que o Tostoes faz

- **Planejamentos compartilhados** com convite por e-mail
- **Fixos** (gastos, recebimentos, aportes) → pendências no **Movimentos**
- **Contas** bancárias e de investimento com saldo real
- **Metas** com prazo e progresso
- **Dashboard** anual (previsto vs confirmado)
- **Grafo de fluxos** entre contas e categorias
- Perfil, tema escuro, EUR/BRL

Detalhes: [PROJETO.md](PROJETO.md) · [FUNCIONALIDADES.md](FUNCIONALIDADES.md)

---

## Estrutura

```
tostoes/
├── gastos-app/       # Angular (npm start)
├── api/              # PHP REST
│   ├── public/       # Front controller
│   ├── src/
│   └── database/
├── docker-compose.yml
└── setup.sh
```

---

## Scripts úteis

```bash
docker compose logs -f api
docker compose down -v          # apaga dados do MySQL
php api/scripts/reset-data.php   # zera lançamentos (mantém usuários)
```

---

## Licença

[MIT](LICENSE)
