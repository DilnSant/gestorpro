# Deploy na Vercel

O repositório já está preparado: `vercel.json` na raiz, função serverless em
`api/index.ts`, npm workspaces e Prisma apontando para Postgres. Falta criar o
projeto e definir as variáveis.

## 1. Importar o repositório

Em <https://vercel.com/new>, importe `DilnSant/gestorpro`.

**Deixe o Root Directory na raiz do repositório.** Não aponte para `frontend/` —
o `vercel.json` da raiz é quem orquestra as duas partes: o frontend vira arquivo
estático e o backend vira função.

As demais configurações de build já vêm do `vercel.json`; não é preciso preencher
Build Command nem Output Directory no painel.

## 2. Variáveis de ambiente

Em Settings → Environment Variables, para **Production** e **Preview**:

| Variável | Onde encontrar o valor |
|---|---|
| `DATABASE_URL` | Supabase → Settings → Database → Connection string. **Use o pooler** (porta 6543) e acrescente `?pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | A mesma, mas conexão direta (porta 5432). O Prisma usa só para migrar |
| `JWT_SECRET` | Copie de `backend/.env` — ou gere outro com `openssl rand -base64 48` |
| `CORS_ORIGINS` | A URL do projeto, ex.: `https://gestorpro.vercel.app` |
| `NODE_ENV` | `production` |

**Sobre o pooler.** Em serverless cada invocação abre sua própria conexão. Sem o
pooler, um pico de acessos esgota o limite de conexões do Postgres e a aplicação
passa a recusar requisições. O `connection_limit=1` é o que faz cada função usar
uma conexão só.

**Sobre o `JWT_SECRET`.** Com ele é possível forjar um token de administrador e
ler os dados de qualquer oficina — não existe segunda barreira depois da
verificação do token. Use um valor diferente do de desenvolvimento, e nunca o
coloque no repositório.

## 3. Verificar depois do primeiro deploy

```
curl https://SEU-PROJETO.vercel.app/health
```

Deve responder `{"ok":true}`. Se responder o HTML do frontend, o rewrite de
`/api` não está sendo aplicado — confira se o Root Directory ficou na raiz.

Depois, no navegador: criar conta, cadastrar a oficina, criar um cliente. Se o
cadastro funcionar e sobreviver a um recarregamento, o Postgres está conectado.

## Como o deploy está montado

```
Requisição
   │
   ├─ /api/*   → api/index.ts → backend/src/app.ts (Express como função)
   ├─ /health  → mesma função
   └─ resto    → frontend/dist/index.html (SPA)
```

Frontend e API compartilham a origem, então o navegador não faz preflight e não
há CORS entre eles. Em desenvolvimento continuam separados (5173 e 3000), e aí o
CORS vale — por isso `CORS_ORIGINS` existe.

## O que mudou para caber em serverless

| Antes | Agora | Por quê |
|---|---|---|
| `app.listen(PORT)` | `export default criarApp()` | Função não abre porta |
| SQLite em arquivo | Postgres | O disco é efêmero; a escrita some entre invocações |
| Upload em `uploads/` | Bytes no banco (`Upload.data`) | Mesmo motivo |

**Sobre os arquivos no banco.** É um trade-off consciente: evita depender de um
segundo serviço e funciona em serverless, ao custo de inchar o banco e não ter
CDN. Sustentável no limite de 10 MB por arquivo que a rota de upload já impõe.
Quando o volume justificar, o caminho é Vercel Blob — a troca fica contida em
`backend/src/routes/upload.ts` e `files.ts`, porque o resto do sistema já
referencia arquivo por id, não por caminho.

## Desenvolvimento local

Continua funcionando, agora contra o mesmo Postgres:

```bash
npm install                 # na raiz, instala os dois workspaces
npm run dev:backend         # porta 3000
npm run dev:frontend        # porta 5173
```

Os testes usam um schema `teste` separado, criado e destruído a cada execução —
nunca tocam nas tabelas de trabalho.
