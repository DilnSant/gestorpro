import { execSync } from 'node:child_process';
import path from 'node:path';
import 'dotenv/config';

// Schema próprio dos testes, dentro do mesmo Postgres.
//
// Rodar contra o schema de trabalho apagaria dados reais e faria cada execução
// depender do que sobrou da anterior. O `?schema=` do Prisma isola de verdade:
// as tabelas são criadas e destruídas dentro de `teste`, sem tocar em `public`.
const URL_BANCO = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!URL_BANCO) {
  throw new Error(
    'Defina DATABASE_URL (ou TEST_DATABASE_URL) no backend/.env para rodar os testes.',
  );
}

const comSchema = (url: string, schema: string) => {
  const u = new URL(url);
  u.searchParams.set('schema', schema);
  return u.toString();
};

const SCHEMA_TESTE = 'teste';
process.env.DATABASE_URL = comSchema(URL_BANCO, SCHEMA_TESTE);
process.env.DIRECT_URL = comSchema(process.env.TEST_DIRECT_URL ?? URL_BANCO, SCHEMA_TESTE);
process.env.JWT_SECRET = 'segredo-de-teste-suficientemente-longo';
process.env.NODE_ENV = 'test';
// Limite por IP desligado: a suíte cria dezenas de contas do mesmo endereço. O
// bloqueio por tentativas erradas é por conta, continua ativo e continua testado.
process.env.RATE_LIMIT_DISABLED = '1';

export const BASE = 'http://127.0.0.1:3998';

let servidor: { close: () => void } | null = null;

export async function prepararBanco() {
  // Derruba e recria o schema de teste: cada execução começa do zero, sem herdar
  // nada da anterior.
  execSync(
    `npx prisma db execute --url "${process.env.DIRECT_URL}" ` +
      `--stdin <<< 'DROP SCHEMA IF EXISTS ${SCHEMA_TESTE} CASCADE; CREATE SCHEMA ${SCHEMA_TESTE};'`,
    { cwd: path.resolve(__dirname, '..'), stdio: 'pipe', shell: '/bin/bash' },
  );

  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(__dirname, '..'),
    env: process.env,
    stdio: 'pipe',
  });
}

export async function subirServidor() {
  const { criarApp } = await import('../src/app');
  const app = criarApp();
  await new Promise<void>((resolve) => {
    servidor = app.listen(3998, '127.0.0.1', () => resolve()) as unknown as { close: () => void };
  });
}

export async function derrubarServidor() {
  const { prisma } = await import('../src/prisma');
  await prisma.$disconnect();
  servidor?.close();
}

type Resposta<T> = { status: number; body: T };

export async function req<T = any>(
  metodo: string,
  caminho: string,
  corpo?: unknown,
  token?: string,
): Promise<Resposta<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const resposta = await fetch(BASE + caminho, {
    method: metodo,
    headers,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });

  const texto = await resposta.text();
  return { status: resposta.status, body: texto ? JSON.parse(texto) : null };
}

/**
 * Envia arquivo. O `req()` acima força JSON, então não serve para multipart.
 */
export async function enviarArquivo(
  token: string,
  nome: string,
  conteudo: Buffer | string,
  mime = 'application/octet-stream',
) {
  const form = new FormData();
  const bytes = typeof conteudo === 'string' ? Buffer.from(conteudo) : conteudo;
  form.append('files', new Blob([new Uint8Array(bytes)], { type: mime }), nome);

  const resposta = await fetch(`${BASE}/api/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  const texto = await resposta.text();
  return { status: resposta.status, body: texto ? JSON.parse(texto) : null };
}

/** Baixa arquivo. Devolve headers e bytes, que o `req()` também não faz. */
export async function baixar(caminho: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const resposta = await fetch(BASE + caminho, { headers });
  const buffer = Buffer.from(await resposta.arrayBuffer());

  return {
    status: resposta.status,
    headers: resposta.headers,
    buffer,
    texto: buffer.toString('utf8'),
  };
}

/** PNG mínimo válido (assinatura + IHDR), para exercitar a detecção por conteúdo. */
export const PNG_VALIDO = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100' +
    '05fe02fa0000000049454e44ae426082',
  'hex',
);

/** Conta nova já com oficina criada. Devolve o token e os ids úteis. */
export async function criarOficina(nome: string, email: string) {
  const cadastro = await req('POST', '/api/auth/register', {
    name: `Dono ${nome}`,
    email,
    password: 'senhaforte123',
  });

  // Falhar aqui com a resposta do servidor evita que o teste real quebre depois
  // com um "cannot read property of undefined" que não diz nada.
  if (!cadastro.body?.token) {
    throw new Error(
      `Não foi possível cadastrar "${email}" (HTTP ${cadastro.status}): ${JSON.stringify(cadastro.body)}`,
    );
  }

  const setup = await req('POST', '/api/auth/setup-company', { name: nome }, cadastro.body.token);

  if (!setup.body?.token) {
    throw new Error(
      `Não foi possível criar a oficina "${nome}" (HTTP ${setup.status}): ${JSON.stringify(setup.body)}`,
    );
  }

  return {
    token: setup.body.token as string,
    userId: setup.body.user.id as string,
    companyId: setup.body.user.company_id as string,
  };
}

export const ITENS_EXEMPLO = [
  { type: 'service', description: 'Troca de óleo', quantity: 1, unit_price: 120.5 },
  { type: 'part', description: 'Filtro de óleo', quantity: 3, unit_price: 33.33 },
];
