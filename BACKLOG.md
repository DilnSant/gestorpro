# GestorPro — Backlog

Mantido pelo `gerente-projeto`. Ordenado por **custo de corrigir depois ÷ custo de
corrigir agora** — não por incômodo.

Status: `pendente` → `em execução` → `em revisão` → `concluída` / `devolvida`

---

## Crítico

| ID | Tarefa | Status |
|----|--------|--------|
| 01 | `Float` → `Int` em centavos nos campos monetários | ✅ concluída |
| 02 | `@@unique` por tenant em `order_number`, `quote_number` e `plate` | ✅ concluída |
| 03 | `items String?` → tabelas `ServiceOrderItem` e `QuoteItem` | ✅ concluída |
| 04 | Índices `@@index([company_id, ...])` em todos os modelos | ✅ concluída |
| 05 | IDOR em `updateMe` / `setup-company` (`userId` vindo do corpo) | ✅ concluída |
| 06 | `where: { company_id: undefined }` não filtrava e vazava todos os tenants | ✅ concluída |
| 07 | `res.json({ user })` devolvia o campo `password` | ✅ concluída |

**Verificado sobre o 01:** `Decimal` **não** resolve no SQLite — a afinidade
NUMERIC armazena como `real` de qualquer forma. Por isso `Int` em centavos, com o
sufixo `_cents` no nome da coluna para a unidade não se perder. A conversão para
reais acontece só na borda da API, em `src/lib/dinheiro.ts`.

**Sobre o 04:** o banco saiu de 1 índice para 29. O SQLite não cria índice
automático para foreign key (diferente do MySQL), então toda listagem filtrada por
`company_id` varria a tabela inteira, incluindo as linhas de outras oficinas.

---

## Alto

| ID | Tarefa | Status |
|----|--------|--------|
| 08 | Autenticação real: argon2id, JWT, rate limit, bloqueio por tentativas | ✅ concluída |
| 09 | `User.email @unique` global bloqueia a mesma pessoa em duas oficinas | **pendente** |
| 34 | Anexos de nota não eram excluídos do disco | ✅ concluída |
| 35 | `CHECK` no `role` — decidido não fazer; garantia em `lib/roles.ts` com teste | ✅ decidido |
| 36 | Testes de frontend | ✅ concluída |
| 10 | `onDelete` explícito nas relações | ✅ concluída |
| 11 | `DATABASE_URL` vindo do `.env` | ✅ concluída |
| 12 | Validação de entrada em todas as rotas | ✅ concluída |
| 13 | Relação real entre `Quote` e `ServiceOrder` | ✅ concluída |

**Sobre o 09 — a decisão que ficou.** O modelo atual é uma conta por oficina, com
o admin trocando de contexto por impersonação. Isso atende ao produto como
especificado, mas impede que a mesma pessoa (um contador, por exemplo) tenha conta
em duas oficinas. Resolver exige uma tabela `Membership` e mudar o formato do
token — decisão de produto, não de código, e cara de reverter depois. Vale decidir
antes de haver base de usuários.

---

## Médio

| ID | Tarefa | Status |
|----|--------|--------|
| 14 | `tsconfig.json` no backend com `esModuleInterop` e `strict` | ✅ concluída |
| 15 | Remover `prisma.config.ts` morto e `postinstall` quebrado | ✅ concluída |
| 16 | Remover `sqlite3` das dependências | ✅ concluída |
| 17 | `git init` + repositório remoto | ✅ concluída |
| 18 | Remover `Vehicle.client_name` | ✅ concluída |
| 19 | Snapshots obrigatórios e nomeados em OS e orçamento | ✅ concluída |
| 20 | `role` validado e nunca lido do corpo da requisição | ✅ concluída |
| 21 | `total_amount` recalculado num único ponto | ✅ concluída |
| 22 | Suíte de testes automatizada | ✅ concluída |
| 23 | `cors()` sem origem definida | ✅ concluída |
| 24 | Arquivos de rota com 0 bytes | ✅ concluída |
| 31 | `setup-company` deixava empresa órfã ao falhar | ✅ concluída |
| 32 | Frontend sem `strict` no tsconfig | ✅ concluída |
| 33 | `PrismaClient` instanciado por arquivo de rota | ✅ concluída |
| 35 | Sem `CHECK` constraint no `role` — a garantia é só de aplicação | **pendente** |

**Sobre o 20 e o 35.** O SQLite não suporta `enum` no Prisma 5, então `role` é
`String`. Um `CHECK` no banco seria defesa a mais, mas o Prisma não o representa
no schema e ele apareceria como drift em toda migração futura. A garantia ficou em
`src/lib/roles.ts`: o papel nunca é lido do corpo de uma requisição, só atribuído
a partir da lista canônica. Há teste cobrindo isso.

---

## Baixo

| ID | Tarefa | Status |
|----|--------|--------|
| 25 | `Company.cnpj` e `Company.domain` sem `@unique` | ✅ concluída |
| 26 | `@@unique([company_id, cpf_cnpj])` em Client | ✅ concluída |
| 27 | Padronizar `snake_case` vs `camelCase` nos timestamps | **pendente** |
| 28 | Soft delete (`deleted_at`) em Client, ServiceOrder e Quote | **pendente** |
| 29 | Autoria (`created_by_id`) em OS e Quote | **pendente** |
| 30 | `Note.related_id` polimórfico, sem FK possível | **pendente** |
| 37 | Recuperação de senha por e-mail | **pendente** |

---

## Cobertura da especificação

Todas as 11 páginas, os componentes compartilhados, a numeração automática por
empresa, a impersonação de admin, o upload de arquivos, os badges das 11
situações, os estados vazios, o skeleton e o layout responsivo estão implementados.

Uma divergência deliberada: a especificação original usa `base44.auth.updateMe` e
`base44.integrations.Core.UploadFile`. O projeto não é base44 — é Express +
Prisma — então o upload foi feito com multer em disco local e a autenticação com
JWT próprio.

---

## Verificação

```
backend:  npm test → 91 testes, 5 arquivos
frontend: npm test → 59 testes, 5 arquivos
backend:  npx tsc --noEmit
frontend: npx tsc -b && npm run build
```

---

## Auditoria de segurança — 2026-08-28

O `auditor-seguranca` revisou a camada de autenticação e deu veredito
**BLOQUEADO**: 16 achados (1 crítico, 4 altos, 6 médios, 5 baixos). **Todos os 16
foram corrigidos**, cada um com teste.

| Sev. | Achado | Correção |
|---|---|---|
| Crítico | `/uploads` servido antes de qualquer autenticação | Modelo `Upload` com dono; leitura por `/api/files/:id` com URL assinada |
| Alto | Sem revogação: trocar senha e sair da impersonação não expulsavam ninguém por 12h | `password_changed_at` e `company_id` conferidos a cada requisição |
| Alto | `.svg` aceito e servido como `image/svg+xml` → XSS armazenado | Fora da allowlist; validação por magic bytes |
| Alto | `failed_login_count` nunca zerava: bloqueio permanente por 1 requisição/15min | Contador zera quando o bloqueio expira |
| Alto | `JWT_SECRET` placeholder passava na validação de comprimento | Recusa marcas de exemplo em produção |
| Médio | PII (chassi, descrições) no log pelo tratador de erro | Só nome, código, rota e id de correlação |
| Médio | `1e30` é finito, passava, e virava 500 com dump de PII | Faixa validada na borda; `P2002` do PUT vira 409 |
| Médio | Enumeração de contas por `/register` e pelo bloqueio | Respostas igualadas |
| Médio | Sem `trust proxy`: um balde de rate limit para a internet inteira | Configurado; kill switch sai de `NODE_ENV` |
| Médio | `change-password` sem limitador, com 2 argon2 de 64 MiB | Limitado e contabilizado no bloqueio |
| Médio | `req.companyId` declarado não-opcional: o tipo mentia | Opcional + `empresaDaRequisicao()` |
| Baixo | Sem `helmet`, `algorithms` não fixado, `related_id` sem tenant, arquivo sem exclusão | Todos corrigidos |

---

## Avaliações registradas

| Data | Entrega | Nota | Veredito |
|------|---------|------|----------|
| 2026-08-27 | `schema.prisma` (versão inicial) | **4,0** | Reprovado — 5 defeitos crítico/alto na fundação. Todos corrigidos na migração `fundacao_dados`. |
