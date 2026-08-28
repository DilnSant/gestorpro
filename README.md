# GestorPro

Sistema de gestão para oficinas mecânicas. SaaS multi-tenant: cada oficina é uma
empresa isolada, com seus próprios clientes, veículos, orçamentos e ordens de serviço.

## O que o sistema faz

O fluxo central é o da oficina de verdade. Um cliente tem veículos. Sobre um veículo
monta-se um **orçamento** com serviços e peças. Aprovado pelo cliente, o orçamento vira
uma **ordem de serviço** em um clique — e a partir daí não pode mais ser alterado, para
não divergir da OS que originou. A ordem caminha por pendente, em andamento, aguardando
peças, concluída e entregue.

Além disso: cadastro de clientes e veículos, notas com anexos, configurações da empresa
(logo e cor), e um painel administrativo onde o dono da plataforma vê todas as oficinas e
pode acessar cada uma para dar suporte.

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Node + Express 5 + TypeScript |
| ORM | Prisma 5 |
| Banco | SQLite |
| Autenticação | argon2id + JWT |
| Frontend | Vite + React 19 + TypeScript |
| Dados no cliente | TanStack Query 5 |
| Rotas | React Router 7 |
| Testes | Vitest (106 casos) |

## Como rodar

Requisitos: Node 20 ou superior.

```bash
# Backend
cd backend
npm install
cp .env.example .env        # ajuste o JWT_SECRET
npx prisma migrate deploy
npm run dev                 # http://localhost:3000

# Frontend, noutro terminal
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

Ao abrir o app pela primeira vez, crie uma conta e em seguida cadastre os dados da sua
oficina. O sistema leva você a essa tela automaticamente.

### Variáveis de ambiente

| Nome | Para quê |
|---|---|
| `DATABASE_URL` | Caminho do banco SQLite |
| `JWT_SECRET` | Assinatura dos tokens. **Obrigatório**, mínimo 16 caracteres — o servidor recusa iniciar sem ele |
| `PORT` | Porta do backend (padrão 3000) |
| `CORS_ORIGINS` | Origens liberadas, separadas por vírgula |

O `.env` não vai para o repositório. Use o `.env.example` como base.

## Testes

```bash
cd backend  && npm test    # 53 casos: autenticação, isolamento, documentos
cd frontend && npm test    # 53 casos: API, componentes, telas
```

Os testes de backend rodam contra um banco próprio (`backend/tests/teste.db`), nunca
contra o banco de desenvolvimento.

## Decisões que valem explicação

**Dinheiro é inteiro em centavos.** As colunas têm o sufixo `_cents`. Ponto flutuante não
representa 0,10 exatamente e o erro se acumula na soma dos itens — numa OS isso vira
centavo divergente na conta do cliente. `Decimal` não resolve no SQLite: a afinidade
NUMERIC acaba armazenando como `real` de qualquer forma. A conversão para reais acontece
só na borda da API, em `src/lib/dinheiro.ts`.

**O tenant vem do token, nunca da requisição.** Todo dado de negócio é filtrado por
`company_id`, e esse valor sai do JWT verificado. Um detalhe que morde: em Prisma,
`where: { company_id: undefined }` não filtra nada e devolve todos os tenants — por isso
o middleware garante uma string não vazia antes de qualquer consulta.

**Os documentos guardam snapshots.** Uma OS registra o nome do cliente e os dados do
veículo como estavam na emissão. Se o cliente mudar de nome ou o carro for vendido, a
ordem emitida em março continua mostrando março. É documento, não relatório.

**A numeração é por oficina.** Cada empresa tem sua própria sequência de OS e orçamentos,
começando em 0001. O índice único por empresa transforma a corrida entre duas criações
simultâneas em um erro tratável, em vez de duas ordens com o mesmo número.

## Estrutura

```
gestorpro/
├── backend/
│   ├── prisma/schema.prisma   # fonte da verdade do modelo
│   ├── src/lib/               # dinheiro, documentos, auth, papéis
│   ├── src/middleware/        # autenticação e escopo por empresa
│   ├── src/routes/            # uma rota por recurso
│   └── tests/
└── frontend/
    ├── src/components/        # PageHeader, StatusBadge, EmptyState, ItemsEditor…
    ├── src/pages/             # uma por tela
    ├── src/lib/api.ts         # ponto único de acesso à API
    └── tests/
```

## Estado do projeto

Em desenvolvimento. As pendências conhecidas estão em [`BACKLOG.md`](BACKLOG.md), com
severidade e justificativa. As convenções que o código segue estão em
[`CLAUDE.md`](CLAUDE.md).

Antes de colocar em produção, veja no backlog os itens ainda abertos — em especial a
decisão sobre identidade de usuário em múltiplas oficinas.
