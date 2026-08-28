import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

// Banco próprio dos testes. Rodar contra o dev.db corromperia os dados de
// trabalho e faria cada execução depender do que sobrou da anterior.
const ARQUIVO = path.resolve(__dirname, 'teste.db');
process.env.DATABASE_URL = `file:${ARQUIVO}`;
process.env.JWT_SECRET = 'segredo-de-teste-suficientemente-longo';
process.env.NODE_ENV = 'test';

export const BASE = 'http://127.0.0.1:3998';

let servidor: { close: () => void } | null = null;

export async function prepararBanco() {
  for (const sufixo of ['', '-journal']) {
    fs.rmSync(ARQUIVO + sufixo, { force: true });
  }
  execSync('npx prisma migrate deploy', {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: `file:${ARQUIVO}` },
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
