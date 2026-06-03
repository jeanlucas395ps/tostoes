# Deploy da API na Alpha Media (cPanel)

O frontend fica na **Vercel** (`https://tostoes.com.br`). A API fica em **`https://api.tostoes.com.br`**, com todos os arquivos dentro de **`public_html`** do subdomínio ou domínio da API.

## 1. Gerar o pacote no seu Mac

```bash
cd api/deploy
chmod +x build-public_html.sh
./build-public_html.sh
```

Isso cria `api/deploy/out/` com tudo que deve ir para o servidor (`.env` de produção já incluso).

## 2. Enviar para o cPanel

1. Abra o **Gerenciador de arquivos** → pasta **`public_html`** do host da API (`api.tostoes.com.br`).
2. Envie **todo o conteúdo** de `deploy/out/` (arquivos na raiz: `index.php`, `.htaccess`, `.env`, `src/`, …).
3. Estrutura final no servidor:

```
public_html/
  .htaccess
  index.php
  .env                 ← você cria a partir do .env.example
  src/
  database/
  scripts/
  storage/
    avatars/
```

## 3. Arquivo `.env` na hospedagem

Copie `.env.example` para `.env` e preencha (valores do seu MySQL cPanel):

```env
DB_CONNECTION=mysql
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=seu_banco
DB_USERNAME=seu_usuario_mysql
DB_PASSWORD=sua-senha-aqui

JWT_SECRET=um-segredo-longo-aleatorio
CORS_ORIGIN=https://tostoes.com.br
APP_URL=https://tostoes.com.br
APP_TIMEZONE=America/Sao_Paulo
MAIL_DRIVER=log
MAIL_FROM=Tostoes <noreply@tostoes.app>
```

A API aceita tanto `DB_DATABASE` / `DB_USERNAME` / `DB_PASSWORD` quanto `DB_NAME` / `DB_USER` / `DB_PASS`.

**Não** suba o `.env` para o Git — só no servidor.

## 4. Banco de dados

1. No cPanel, crie o banco e o usuário MySQL (se ainda não existir).
2. Associe o usuário ao banco com **todos os privilégios**.
3. Rode as migrações **uma vez** (Terminal do cPanel ou SSH):

```bash
cd ~/public_html
php scripts/migrate.php
```

Isso cria tabelas e migrações. Usuário inicial opcional via `SETUP_USER` / `SETUP_PASSWORD` no `.env`, ou cadastro na web.

## 5. Permissões

| Pasta | Permissão sugerida |
|--------|-------------------|
| `storage/` | `755` ou `775` (gravável pelo PHP) |
| `storage/avatars/` | `755` ou `775` |

Sem isso, upload de avatar e logs de e-mail falham.

## 6. PHP

- Versão **8.1+** (recomendado **8.2** ou **8.3**).
- Extensões: **pdo_mysql**, **json**, **mbstring**.

## 7. CORS e frontend

No `.env` da API, `CORS_ORIGIN` deve ser **exatamente** a URL do site na Vercel, sem barra no final, por exemplo:

`https://tostoes.com.br`

Se usar preview da Vercel, adicione temporariamente outra origem ou teste só no domínio principal.

No build do frontend (`gastos-app`), a API já aponta para:

`https://api.tostoes.com.br/api`

## 8. Testar

```bash
curl -s -o /dev/null -w "%{http_code}" https://api.tostoes.com.br/api/settings
```

Esperado: `401` (sem token) ou `200` com login — não `404` nem `500`.

Login de teste após migrate:

- Usuário: o definido em `SETUP_USER` ou cadastro em `/cadastro`
- Senha: a definida em `SETUP_PASSWORD` no migrate

## 9. Segurança pós-deploy

- `src/`, `database/` e `scripts/` têm `.htaccess` com **Require all denied** (acesso só via `index.php`).
- Após migrar, pode remover a pasta `scripts/` do servidor se não for mais usar CLI.
- Troque `JWT_SECRET` por valor forte e único.

## 10. Copiar banco local → cPanel

Com o MySQL local (Docker) cheio de dados:

```bash
cd api
./scripts/sync-db-to-cpanel.sh
```

Gera `deploy/out/gastos_data.sql` (~200 KB com seus dados).

**Importação automática** (escolha uma):

1. **SSH** — em `api/.env.hosting`:
   ```env
   SSH_HOST=seudominio.com.br
   SSH_USER=seu_usuario_cpanel
   ```
   Rode `./scripts/sync-db-to-cpanel.sh` de novo.

2. **Terminal do cPanel** — envie o `.sql` e execute:
   ```bash
   mysql -h localhost -u SEU_USER -p SEU_BANCO < ~/gastos_data.sql
   ```

3. **PHP no servidor** (com a API em `public_html`):
   ```bash
   php scripts/import-database.php ~/gastos_data.sql
   ```

O `DB_HOST=localhost` do cPanel **não** aceita conexão direta do seu Mac; use SSH ou importe no servidor.

## 11. Atualizar a API depois

Rode de novo `./build-public_html.sh`, envie por FTP **apenas** o que mudou (`src/`, `index.php`, `.htaccess`), **sem** sobrescrever `.env` nem `storage/`.
