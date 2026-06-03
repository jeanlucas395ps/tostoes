# Funcionalidades do sistema Gastos

Documentação das funcionalidades do aplicativo **Tostoes** — controle financeiro compartilhado (planejamentos, casal ou família). O sistema separa **valores reais lançados** de **metas planejadas**, com foco em clareza mensal no estilo de apps como Mobills.

---

## Visão geral

| Camada | Tecnologia | Função |
|--------|------------|--------|
| Frontend | Angular 19 (standalone) | Interface web: login, relatórios, lançamentos |
| API | PHP 8.3 + Apache | REST JSON, autenticação JWT |
| Banco | MySQL 8 | Persistência de usuários, lançamentos e projeções |
| Infra | Docker Compose | MySQL + API em containers |

**Conceito central:** membros de um **planejamento** compartilham os mesmos dados financeiros; cada lançamento pode registrar **quem cadastrou** e **quem é o responsável**.

---

## Autenticação e usuários

### Login

- Tela em `/login` com formulário usuário + senha.
- Cadastro em `/cadastro` (e-mail, nome, senha).
- Após login bem-sucedido, o token JWT fica no `localStorage` (`gastos-token`).

### Usuário inicial (opcional)

A migração `api/scripts/migrate.php` pode criar um usuário se `SETUP_USER` e `SETUP_PASSWORD` estiverem no `.env`. Caso contrário, use o cadastro na web.

### Segurança

- Senhas armazenadas com `password_hash` (bcrypt).
- Rotas protegidas exigem header `Authorization: Bearer <token>`.
- Token válido por 30 dias.
- **Guards Angular:**
  - `authGuard`: bloqueia área logada sem token válido; valida sessão via `/auth/me`.
  - `guestGuard`: se já houver sessão válida, redireciona do login para o dashboard.
- **Interceptor HTTP:** anexa o token em todas as requisições; em 401 (exceto login/me), faz logout.

### Quem registrou o lançamento

Todo lançamento em `transactions` guarda `registered_by_user_id` com o usuário logado no momento do cadastro. Na lista aparece avatar e texto “registrado por …”.

---

## Navegação principal

Após login, o menu lateral oferece:

| Rota | Nome | Descrição resumida |
|------|------|-------------------|
| `/dashboard` | Relatório | Visão consolidada do ano/mês |
| `/ganhos` | Ganhos | Entradas de dinheiro (reais) |
| `/custos` | Custos | Despesas do dia a dia (reais) |
| `/investimentos` | Investimentos | Aportes e metas por tipo |
| `/configuracoes` | Ajustes | Câmbio, metas globais, parâmetros |

O componente **navegação por mês** (‹ Mês Ano ›) aparece no relatório, ganhos, custos e investimentos.

---

## Relatório (Dashboard)

**Rota:** `/dashboard`

### Objetivo

Mostrar a situação financeira **com base apenas em lançamentos reais** (`transactions`), comparando com projeções quando existirem.

### O que exibe

1. **Saldo do mês (real)**  
   `Ganhos − Custos − Investimentos − Lazer` (valores efetivamente lançados no mês).

2. **Três cards clicáveis**
   - Ganhos do mês (com meta planejada, se houver projeção).
   - Custos do mês (com previsto da projeção).
   - Investido no mês (com meta da projeção).

3. **Totais do ano**  
   Soma de ganhos, custos, investimentos e saldo acumulado no ano selecionado.

4. **Gráfico de barras**  
   Evolução mensal: ganhos, custos e investimentos reais (12 meses).

5. **Investimentos por tipo (ano)**  
   Barra de progresso por tipo (Reserva, Apartamento, Capitalização, etc.): realizado vs meta anual.

6. **Tabela “Todos os meses”**  
   Linha por mês com ganhos, custos, investimentos e saldo; clique na linha altera o mês em foco.

### Filtros

- Seletor de **ano** (ex.: 2026, 2027).
- Navegação de **mês** para detalhar o card principal.

### API

`GET /api/dashboard/summary?year=2026`

---

## Ganhos

**Rota:** `/ganhos`  
**Tipo no banco:** `kind = income`

### Objetivo

Registrar **todo dinheiro que entrou**: salários, reembolsos, extras, freelas, etc.

### Funcionalidades

- Lista de lançamentos do mês selecionado (ordenados por data).
- **Total do mês** em destaque.
- Botão **+** para novo lançamento.
- Toque/ clique no item para **editar**.
- Botão **×** para **excluir** (com confirmação).
- Formulário (modal): data, descrição, valor, moeda (BRL/EUR), categoria, região, observações.
- Conversão automática EUR → BRL usando taxa das configurações.
- Exibe quem registrou (avatar).

### Categorias sugeridas

Salário, Freela, Reembolso, Extra, Outros.

### API

- `GET /api/transactions?year=&month=&kind=income`
- `POST /api/transactions`
- `PUT /api/transactions/{id}`
- `DELETE /api/transactions/{id}`

---

## Custos

**Rota:** `/custos`  
**Tipo no banco:** `kind = expense`

### Objetivo

Registrar **gastos reais** , substitui a “Folha 2” da planilha: o que de fato saiu, não estimativas.

### Funcionalidades

Mesmas do módulo Ganhos (lista, total, CRUD, BRL/EUR, região, quem registrou), com:

- Destaque visual em vermelho.
- Categorias sugeridas: Brasil, Portugal, Moradia, Alimentação, Assinaturas, Outros.

### Regra de balanço

**Somente custos desta aba** entram como “saída real” no relatório. Estimativas antigas da planilha (Folha 1) não substituem estes valores.

### API

`GET /api/transactions?...&kind=expense` (+ POST/PUT/DELETE).

---

## Investimentos

**Rota:** `/investimentos`  
**Tipo no banco:** `kind = investment`

### Objetivo

Separar **aporte/poupança** de **gasto do dia a dia**. Responde: “quanto investimos e em qual tipo?”

### Abas

1. **Real** , lançamentos efetivos do mês.
2. **Projeção** , metas mensais cadastradas em `monthly_projections` (planejado).

### Cards por tipo

Cada tipo de investimento mostra:

- Nome e cor (ex.: Reserva, Apartamento, Capitalização).
- Meta mensal em R$.
- Barra de progresso: % da meta atingida no mês (soma dos aportes reais daquele tipo).

### Lançamento de aporte

- Data, descrição, valor, moeda.
- **Tipo obrigatório** (dropdown com tipos cadastrados).
- Quem registrou.

### Tipos padrão (migração)

| Tipo | Meta mensal sugerida |
|------|----------------------|
| Reserva | R$ 5.410 |
| Apartamento | R$ 1.000 |
| Capitalização | R$ 96,33 |

### API

- Transações: `kind=investment` + `investment_type_id`
- `GET /api/investment-types`
- `GET /api/projections?year=&kind=investment`

---

## Ajustes (Configurações)

**Rota:** `/configuracoes`

### Parâmetros editáveis

| Campo | Uso |
|-------|-----|
| EUR → BRL | Converte valores em euro nos lançamentos |
| Lazer mensal planejado | Referência para comparação no relatório |
| Montante inicial investimentos | Patrimônio inicial de referência |
| Taxa CDI mensal | Parâmetro para projeções futuras (reservado/evolução) |

Valores salvos no servidor (`user_settings`), vinculados à conta compartilhada do casal.

### API

- `GET /api/settings`
- `PUT /api/settings`

---

## Projeções mensais (planejado)

**Tabela:** `monthly_projections`

### Objetivo

Armazenar **metas e estimativas** (equivalente conceitual à Folha 1 da planilha): quanto se espera ganhar, gastar ou investir em cada mês.

### Características

- Por ano, mês, tipo (`income`, `expense`, `investment`, `leisure`).
- Nome, categoria, região, valor em BRL.
- Opcional: dia de vencimento, responsável, tipo de investimento.

### Uso no sistema

- O **dashboard** compara real vs projetado quando há projeção no mês.
- A aba **Projeção** em Investimentos lista itens planejados.
- API de criação/atualização via `POST /api/projections` (uso direto ou futura UI).

**Importante:** projeções **não substituem** custos reais no balanço; servem para meta e comparativo.

---

## Tipos de lançamento (`kind`)

| Valor | Significado | Onde cadastrar |
|-------|-------------|----------------|
| `income` | Ganho / entrada | Aba Ganhos |
| `expense` | Custo / despesa | Aba Custos |
| `investment` | Aporte / investimento | Aba Investimentos |
| `leisure` | Lazer | Pode ser lançado; meta também em configurações |

---

## Regiões e moedas

### Região (`region`)

- `BR` , Brasil  
- `PT` , Portugal  
- `geral` , Outros / geral  

Útil para filtrar e organizar gastos como na planilha (Brasil vs Portugal).

### Moeda

- `BRL` , valor em reais (armazenado direto em `amount_brl`).
- `EUR` , convertido na API com `eur_to_brl` das configurações.

---

## Conta compartilhada do casal

- Dados financeiros ficam vinculados a um **planejamento** (`planning_id`); membros convidados veem e editam os mesmos lançamentos conforme permissões.
- A distinção é **quem registrou** (`registered_by_user_id`), não dados separados por pessoa.

---

## API REST , resumo de endpoints

| Método | Rota | Autenticação | Função |
|--------|------|--------------|--------|
| POST | `/api/auth/login` | Não | Login, retorna token + usuário |
| GET | `/api/auth/me` | Sim | Usuário logado |
| GET | `/api/auth/users` | Sim | Lista membros do planejamento |
| GET | `/api/settings` | Sim | Configurações |
| PUT | `/api/settings` | Sim | Atualiza configurações |
| GET | `/api/dashboard/summary` | Sim | Relatório anual/mensal |
| GET | `/api/transactions` | Sim | Lista (filtros: year, month, kind) |
| POST | `/api/transactions` | Sim | Cria lançamento |
| PUT | `/api/transactions/{id}` | Sim | Atualiza lançamento |
| DELETE | `/api/transactions/{id}` | Sim | Remove lançamento |
| GET | `/api/investment-types` | Sim | Tipos de investimento |
| POST | `/api/investment-types` | Sim | Cria tipo |
| PUT | `/api/investment-types/{id}` | Sim | Atualiza tipo |
| GET | `/api/projections` | Sim | Projeções do ano |
| POST | `/api/projections` | Sim | Cria/atualiza projeção |
| DELETE | `/api/projections/{id}` | Sim | Remove projeção |

Base URL em desenvolvimento: `http://localhost:8090/api` (Docker) ou `/api` via proxy do Angular (`npm start`).

---

## Regras de negócio (balanço)

```
Saldo do mês (real) =
  Ganhos (lançamentos income)
  − Custos (lançamentos expense)
  − Investimentos (lançamentos investment)
  − Lazer (lançamentos leisure, se houver)
```

| Origem | Entra no balanço como |
|--------|------------------------|
| Lançamentos em **Ganhos** | Entrada |
| Lançamentos em **Custos** | Saída |
| Lançamentos em **Investimentos** | Investimento (separado de custo) |
| **Projeções** (`monthly_projections`) | Apenas comparação/meta no dashboard |
| Estimativas antigas da planilha (Folha 1) | Não entram automaticamente; devem ser lançadas como real ou cadastradas como projeção |

---

## Infraestrutura Docker

```bash
docker compose up -d --build
```

| Serviço | Porta | Descrição |
|---------|-------|-----------|
| `gastos-api` | 8090 | API PHP + Apache |
| `gastos-mysql` | 3308 | MySQL (root/root, DB `gastos`) |

Na subida, o container da API executa `migrate.php` (schema, usuários, tipos de investimento).

### Frontend

```bash
cd gastos-app
npm start   # http://localhost:4200 , proxy /api → :8090
```

Arquivo `.env` do app: `API_URL=/api`

---

## Arquivos legados (não usados nas rotas atuais)

Existem no código componentes da versão inicial com `localStorage` (`folha-1`, `folha-2`, `storage.service`). As rotas ativas usam a API e os módulos **Ganhos**, **Custos** e **Investimentos**.

---

## Fluxo típico de uso

1. Usuário faz login (ou cadastro).
2. No fim do mês (ou no dia a dia), lança **custos reais** em Custos e **ganhos** em Ganhos.
3. Ao investir, lança em **Investimentos** com o tipo correto.
4. Abre o **Relatório** para ver saldo, gráficos e comparar com metas.
5. Ajusta **EUR→BRL** e metas em **Ajustes** quando necessário.

---

## Documentos relacionados

- [README.md](README.md) , como subir o projeto  
- [CHECKLIST.md](CHECKLIST.md) , roadmap e itens pendentes  
- [gastos-app/README.md](gastos-app/README.md) , detalhes do frontend
