import { createHmac } from 'node:crypto';
import path from 'node:path';
import jwt from 'jsonwebtoken';

// ---------------------------------------------------------------------------
// Segredo próprio para URLs de arquivo.
//
// Derivado do JWT_SECRET, mas diferente dele. Sem isso, um token de arquivo
// assinado com o mesmo segredo seria aceito como token de sessão — e vice-versa.
// A separação por audiência é a segunda barreira, não a única.
// ---------------------------------------------------------------------------
function segredoDeArquivos(): string {
  const base = process.env.JWT_SECRET;
  if (!base) throw new Error('JWT_SECRET ausente.');
  return createHmac('sha256', base).update('gestorpro:arquivos:v1').digest('hex');
}

export const AUDIENCIA_ARQUIVO = 'arquivo';

const TTL_SEGUNDOS = 60 * 60; // 1 hora
const BUCKET_SEGUNDOS = 5 * 60;

export type ConteudoTokenArquivo = { fid: string; cid: string };

/**
 * Assina uma URL de leitura para um arquivo.
 *
 * O `exp` é arredondado para um bucket de 5 minutos e o `iat` é omitido, de forma
 * que a string seja idêntica entre serializações próximas. Sem isso o `src` do
 * `<img>` mudaria a cada resposta e o browser rebaixaria a imagem toda vez.
 */
export function assinarUrlArquivo(uploadId: string, companyId: string): string {
  const agora = Math.floor(Date.now() / 1000);
  const exp = Math.ceil(agora / BUCKET_SEGUNDOS) * BUCKET_SEGUNDOS + TTL_SEGUNDOS;

  const token = jwt.sign({ fid: uploadId, cid: companyId, exp }, segredoDeArquivos(), {
    audience: AUDIENCIA_ARQUIVO,
    noTimestamp: true,
    algorithm: 'HS256',
  });

  return `/api/files/${uploadId}?t=${token}`;
}

export function verificarTokenArquivo(token: string): ConteudoTokenArquivo | null {
  try {
    const conteudo = jwt.verify(token, segredoDeArquivos(), {
      audience: AUDIENCIA_ARQUIVO,
      algorithms: ['HS256'],
    }) as jwt.JwtPayload;

    if (typeof conteudo.fid !== 'string' || typeof conteudo.cid !== 'string') return null;
    return { fid: conteudo.fid, cid: conteudo.cid };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Referências
//
// Uma referência persistida no banco tem duas formas possíveis:
//   nova    → "/api/files/<uploadId>"
//   legada  → "/uploads/<storageKey>"   (antes de os arquivos terem dono)
//
// A migração de backfill deliberadamente não reescreveu as colunas antigas, então
// as duas formas convivem até a limpeza final.
// ---------------------------------------------------------------------------
export type Referencia =
  | { tipo: 'id'; uploadId: string }
  | { tipo: 'legado'; storageKey: string }
  | null;

export function resolverReferencia(valor: unknown): Referencia {
  if (typeof valor !== 'string' || valor.trim() === '') return null;
  const limpo = valor.split('?')[0]!.trim();

  if (limpo.startsWith('/api/files/')) {
    const uploadId = limpo.slice('/api/files/'.length);
    return uploadId ? { tipo: 'id', uploadId } : null;
  }
  if (limpo.startsWith('/uploads/')) {
    const storageKey = limpo.slice('/uploads/'.length);
    return storageKey ? { tipo: 'legado', storageKey } : null;
  }
  return null;
}


// ---------------------------------------------------------------------------
// Tipos de arquivo
//
// `.svg` fica de fora de propósito: é XML executável, e servido como
// image/svg+xml na origem da API vira XSS armazenado — com o token do frontend
// em localStorage, ao alcance de qualquer script.
// ---------------------------------------------------------------------------
export const MIMES_PERMITIDOS = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

/** Só estes são devolvidos com `inline`; o resto vira download. */
const EXIBIVEIS = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf']);

export const podeExibirInline = (mime: string) => EXIBIVEIS.has(mime);

const EXTENSOES_ESPERADAS: Record<string, string[]> = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
  'text/plain': ['.txt'],
  'text/csv': ['.csv'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
};

const comecaCom = (buffer: Buffer, bytes: number[]) =>
  bytes.every((b, i) => buffer[i] === b);

/**
 * Detecta o tipo pelo conteúdo, não pelo nome.
 *
 * O `fileFilter` do multer roda antes de os bytes chegarem, então a checagem de
 * extensão sozinha não impede um `.png` que na verdade é HTML.
 */
export function detectarMime(buffer: Buffer, extensao: string): string | null {
  if (buffer.length === 0) return null;

  if (comecaCom(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (comecaCom(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (comecaCom(buffer, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (comecaCom(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';

  if (
    comecaCom(buffer, [0x52, 0x49, 0x46, 0x46]) &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }

  // ZIP: os formatos OOXML (.docx, .xlsx) são zips. A extensão desempata, mas só
  // entre tipos que realmente têm essa assinatura.
  if (comecaCom(buffer, [0x50, 0x4b, 0x03, 0x04])) {
    if (extensao === '.docx') {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    if (extensao === '.xlsx') {
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    return null;
  }

  // OLE2 legado (.doc, .xls)
  if (comecaCom(buffer, [0xd0, 0xcf, 0x11, 0xe0])) {
    if (extensao === '.doc') return 'application/msword';
    if (extensao === '.xls') return 'application/vnd.ms-excel';
    return null;
  }

  // Texto não tem assinatura. Aceita só se for UTF-8 válido e sem byte nulo, e
  // sempre será servido como anexo, nunca renderizado.
  if (extensao === '.txt' || extensao === '.csv') {
    const amostra = buffer.subarray(0, 8192);
    if (amostra.includes(0)) return null;
    if (!amostra.equals(Buffer.from(amostra.toString('utf8'), 'utf8'))) return null;
    return extensao === '.csv' ? 'text/csv' : 'text/plain';
  }

  return null;
}

/** O tipo detectado precisa bater com a extensão declarada. */
export function extensaoCombina(mime: string, extensao: string): boolean {
  return (EXTENSOES_ESPERADAS[mime] ?? []).includes(extensao);
}
