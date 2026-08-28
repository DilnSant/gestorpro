# GestorPro — Backlog

Mantido pelo `gerente-projeto`. Ordenado por **custo de corrigir depois ÷ custo de
corrigir agora** — não por incômodo.

Status: `pendente` → `em execução` → `em revisão` → `concluída` / `devolvida`

---

## Crítico — decidir antes de mais código depender disso

| ID | Tarefa | Dono | Status |
|----|--------|------|--------|
| 01 | Trocar `Float` por `Int` (centavos) nos 8 campos monetários de `ServiceOrder` e `Quote` | estrategista → programador | **pendente** |
| 02 | `@@unique([company_id, order_number])`, `([company_id, quote_number])`, `([company_id, plate])` | estrategista → programador | **pendente** |
| 03 | `items String?` → tabelas `ServiceOrderItem` e `QuoteItem` | estrategista → programador | **pendente** |
| 04 | Índices `@@index([company_id, ...])` em Client, Vehicle, ServiceOrder, Quote, Note, User | programador | **pendente** |
| 05 | `updateMe` e `setup-company` aceitam `userId` do corpo — IDOR. Só se resolve com o 08 | auditor-seguranca | **pendente** |
| 06 | `User.company_id` opcional → `where: { company_id: undefined }` no Prisma **não filtra** | estrategista | **pendente** |
| 07 | `res.json({ user })` devolvia o campo `password` | programador | ✅ concluída |

**Mitigação parcial aplicada em 01:** os totais passaram a ser somados em centavos
inteiros no servidor (`src/lib/documentos.ts`) e só o resultado final vira decimal. Isso
elimina o acúmulo de erro item a item, mas a coluna continua sendo `REAL` no banco — a
correção definitiva ainda é necessária.

**Verificado:** `Decimal` **não** resolve no SQLite. A afinidade NUMERIC armazena como
`real` de qualquer forma. Centavos em `Int` é a única opção segura enquanto o provider
for SQLite.

---

## Alto

| ID | Tarefa | Dono | Status |
|----|--------|------|--------|
| 08 | Autenticação real: hash de senha, JWT verificado, rate limit. Hoje o login não pede senha e o tenant vem de um header do cliente | estrategista → programador | **pendente** |
| 09 | `User.email @unique` global bloqueia a mesma pessoa em duas oficinas | estrategista | **pendente** |
| 10 | `onDelete` explícito nas 11 relações | estrategista → programador | **pendente** |
| 11 | `url = "file:./dev.db"` hardcoded → `env("DATABASE_URL")`. Sem isso, teste roda contra o banco de desenvolvimento | programador | **pendente** |
| 12 | Validação de entrada em todas as rotas | programador | ✅ concluída |
| 13 | Vínculo Quote↔ServiceOrder sem `@relation` no schema | estrategista | **pendente** |

**Sobre o 08 — a dívida mais séria em aberto.** O `x-company-id` continua vindo do
cliente. Qualquer um que descubra o id de uma empresa lê e escreve os dados dela. Existe
uma guarda que derruba o servidor se `NODE_ENV=production`, mas isso é um freio, não uma
solução. Corrigir exige mudar frontend e backend juntos.

O caminho de bypass mais grave já foi fechado: `x-role: admin` dispensava o
`x-company-id` e o filtro do Prisma sumia, expondo todos os tenants de uma vez.

---

## Médio

| ID | Tarefa | Dono | Status |
|----|--------|------|--------|
| 14 | `tsconfig.json` no backend com `esModuleInterop` e `strict` | programador | ✅ concluída |
| 15 | Remover `prisma.config.ts` morto e o `postinstall` quebrado | programador | ✅ concluída |
| 16 | Remover `sqlite3` das dependências | programador | ✅ concluída |
| 17 | `git init` + primeiro commit (o `.gitignore` já existe) | — | **pendente** |
| 18 | Remover `Vehicle.client_name` — duplicação sem função de snapshot | programador | **pendente** |
| 19 | `client_name`/`vehicle_info` em OS e Quote: tornar obrigatórios, sufixo `_snapshot` | estrategista | **pendente** |
| 20 | `role` com default `"owner"` (o mais privilegiado) e sem validação | programador | **pendente** |
| 21 | `total_amount` recalculado num único ponto, nunca aceito do cliente | programador | ✅ concluída |
| 22 | Infraestrutura de teste automatizado. Existe uma suíte de ponta a ponta manual (34 casos), mas nenhum runner no projeto | qa-testes | **pendente** |
| 23 | `cors()` sem origem definida | programador | **pendente** |
| 24 | `routes/auth.ts`, `company.ts`, `notes.ts`, `quotes.ts` estavam com 0 bytes | programador | ✅ concluída |
| 31 | `setup-company` criava a empresa e só depois vinculava o usuário; falha deixava empresa órfã | programador | ✅ concluída |
| 32 | Frontend sem `strict` no tsconfig — o backend tem, o frontend não | programador | **pendente** |
| 33 | `PrismaClient` instanciado por arquivo de rota, cada um com seu pool | programador | ✅ concluída |

---

## Baixo

| ID | Tarefa | Dono | Status |
|----|--------|------|--------|
| 25 | `Company.cnpj` e `Company.domain` sem `@unique` | programador | **pendente** |
| 26 | `@@unique([company_id, cpf_cnpj])` em Client | programador | **pendente** |
| 27 | Padronizar nomenclatura: campos `snake_case`, timestamps `camelCase` | programador | **pendente** |
| 28 | Soft delete (`deleted_at`) em Client, ServiceOrder e Quote | estrategista | **pendente** |
| 29 | Autoria (`created_by_id`) em OS e Quote | estrategista | **pendente** |
| 30 | `Note.related_id` polimórfico, sem FK possível | estrategista | **pendente** |
| 34 | Anexos de nota não são excluídos do disco ao apagar a nota | programador | **pendente** |

---

## Cobertura da especificação

| Item | Situação |
|------|----------|
| CompanySetup, Dashboard, ServiceOrders, ServiceOrderForm | ✅ |
| Quotes, QuoteForm, conversão em OS | ✅ |
| Clients, Vehicles, Notes (com upload), CompanySettings, AdminPanel | ✅ |
| PageHeader, StatusBadge, EmptyState, ItemsEditor, Skeleton | ✅ |
| Sidebar com drawer no mobile, "Voltar ao Admin", impersonação | ✅ |
| Numeração automática por empresa, react-query, CompanyContext | ✅ |
| Badges coloridos das 11 situações, estados vazios, responsivo, pt-BR | ✅ |
| Upload de arquivos | ✅ via `/api/upload` (multer, disco local) em vez do `base44.integrations.Core.UploadFile` do spec original |

---

## Avaliações registradas

| Data | Entrega | Agente | Nota | Veredito |
|------|---------|--------|------|----------|
| 2026-08-27 | `backend/prisma/schema.prisma` | (Antigravity IDE) | **4,0** | Reprovado — 5 defeitos crítico/alto na fundação, um parcialmente irreversível |
