# GestorPro — Contexto do Projeto

Sistema de gestão para oficina mecânica. SaaS multi-tenant: cada oficina é uma `Company`,
e **todo** dado de negócio pertence a uma empresa via `company_id`.

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Node + Express 5 + TypeScript |
| ORM | Prisma 5.22 |
| Banco | SQLite (`backend/prisma/dev.db`) |
| Frontend | Vite + React 19 + TypeScript |
| Dados no cliente | TanStack Query 5 |
| Rotas | React Router 7 |
| Ícones | lucide-react |
| Lint | oxlint |

```
gestorpro/
├── backend/
│   ├── prisma/schema.prisma     # fonte da verdade do modelo de dados
│   ├── prisma/migrations/
│   └── src/
│       ├── index.ts             # bootstrap do Express
│       ├── middleware/
│       └── routes/
└── frontend/
    └── src/
```

## Domínio

Sete modelos: `User`, `Company`, `Client`, `Vehicle`, `ServiceOrder` (OS), `Quote`
(orçamento), `Note`.

O fluxo central do negócio: um `Client` tem `Vehicle`s. Sobre um veículo cria-se um
`Quote`; aprovado, ele vira uma `ServiceOrder` (o vínculo é `Quote.converted_to_os_id`
e `ServiceOrder.from_quote_id`). A OS caminha por `pending → in_progress →
waiting_parts → completed → delivered`, ou `cancelled`.

## Regras inegociáveis

**1. Isolamento por tenant.** Toda query de dado de negócio filtra por `company_id`.
O `company_id` vem **sempre** do token JWT verificado (`req.companyId`, populado por
`rotaDaEmpresa`) — nunca do corpo, da query string, de header ou de parâmetro de rota.
Cuidado com o filtro que *parece* existir: `where: { company_id: undefined }` no Prisma
não filtra nada e devolve todos os tenants.

**2. Identidade vem do token.** Nenhuma rota aceita `userId` do corpo da requisição
para decidir sobre quem age. Vale para update, delete e leitura.

**3. Dinheiro é `Int` em centavos.** As colunas têm o sufixo `_cents` para a unidade
não se perder. A conversão para reais acontece só na borda, em `src/lib/dinheiro.ts`.
`Decimal` não resolve no SQLite: a afinidade NUMERIC armazena como `real` do mesmo jeito.

**4. Senha nunca em texto puro.** Hash com bcrypt/argon2 na escrita; comparação por
função de verificação na leitura. Nenhuma resposta de API devolve o campo `password`.

**5. Entrada é validada na borda.** Toda rota valida corpo e parâmetros antes de tocar
no Prisma. Erro de validação retorna 400 com a causa; não 500 genérico.

**6. Dados pessoais.** O sistema guarda CPF/CNPJ, telefone, endereço e e-mail de
clientes finais. LGPD se aplica. Nada disso vai para log.

## Convenções

- Colunas do banco em `snake_case` (`company_id`, `total_amount`); código TypeScript em
  `camelCase`.
- Rotas REST sob `/api/<recurso>`, uma por arquivo em `src/routes/`.
- Toda rota autenticada passa pelo middleware de autenticação — sem exceção pontual.

## Verificação antes de dizer que está pronto

```
cd backend  && npm test && npx tsc --noEmit
cd frontend && npx tsc -b && npm run build
```

Os testes rodam contra `backend/tests/teste.db`, nunca contra o `dev.db`.

## Estado atual (2026-08-27)

Backend e frontend completos conforme a especificação, com 53 testes passando.
Autenticação real (argon2id + JWT), dinheiro em centavos, itens relacionais e
isolamento por tenant verificado por teste.

Pendências conhecidas estão em `BACKLOG.md`. Antes de abrir tarefa nova, leia o backlog:
os itens restantes já estão mapeados com severidade e justificativa.
