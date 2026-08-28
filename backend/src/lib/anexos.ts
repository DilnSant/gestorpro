import fs from 'node:fs';
import { prisma } from '../prisma';
import { assinarUrlArquivo, caminhoDoArquivo, resolverReferencia } from './arquivos';

// Serialização e ciclo de vida dos arquivos referenciados por outras entidades.
//
// O banco guarda a REFERÊNCIA ("/api/files/<id>"), que não expira. A API devolve
// junto a URL ASSINADA, que expira — é ela que faz `<img src>` e `<a href>`
// funcionarem sem header. Trocar as duas é o erro mais fácil de cometer aqui: uma
// URL assinada gravada no banco vira link morto em uma hora.

export type ArquivoPublico = {
  id: string;
  url: string;
  view_url: string;
  name: string;
  mime: string;
  size: number;
};

/**
 * Resolve referências (novas ou legadas) para os registros de Upload da empresa.
 * Referência que não corresponde a um arquivo vivo da empresa é simplesmente
 * descartada — dado órfão não deve derrubar a listagem.
 */
export async function carregarArquivos(
  referencias: unknown,
  companyId: string,
): Promise<ArquivoPublico[]> {
  const lista = lerLista(referencias);
  if (lista.length === 0) return [];

  const ids: string[] = [];
  const chaves: string[] = [];
  for (const bruto of lista) {
    const ref = resolverReferencia(bruto);
    if (ref?.tipo === 'id') ids.push(ref.uploadId);
    else if (ref?.tipo === 'legado') chaves.push(ref.storageKey);
  }

  if (ids.length === 0 && chaves.length === 0) return [];

  const registros = await prisma.upload.findMany({
    where: {
      company_id: companyId,
      deleted_at: null,
      OR: [{ id: { in: ids } }, { storage_key: { in: chaves } }],
    },
  });

  return registros.map((registro) => ({
    id: registro.id,
    url: `/api/files/${registro.id}`,
    view_url: assinarUrlArquivo(registro.id, companyId),
    name: registro.original_name,
    mime: registro.mime_type,
    size: registro.size_bytes,
  }));
}

/** Uma referência só (a logo da empresa). */
export async function carregarArquivo(
  referencia: unknown,
  companyId: string,
): Promise<ArquivoPublico | null> {
  const [primeiro] = await carregarArquivos([referencia], companyId);
  return primeiro ?? null;
}

/**
 * Confirma que as referências pertencem à empresa e devolve a forma canônica a
 * gravar. Referência de outra empresa é recusada, não ignorada em silêncio.
 */
export async function normalizarReferencias(
  referencias: unknown,
  companyId: string,
): Promise<{ referencias: string[] } | { erro: string }> {
  const lista = lerLista(referencias);
  if (lista.length === 0) return { referencias: [] };

  const arquivos = await carregarArquivos(lista, companyId);
  if (arquivos.length !== lista.length) {
    return { erro: 'Algum dos arquivos informados não existe ou não pertence a esta oficina.' };
  }
  return { referencias: arquivos.map((a) => a.url) };
}

/**
 * Exclui os arquivos apontados pelas referências: soft delete no banco e remoção
 * do disco. Sem isto, todo anexo removido de uma nota ficaria no volume para
 * sempre, sem dono e sem caminho de exclusão (item 34 do backlog, e LGPD art. 18).
 */
export async function excluirArquivos(referencias: unknown, companyId: string): Promise<void> {
  const arquivos = await carregarArquivos(referencias, companyId);
  if (arquivos.length === 0) return;

  const registros = await prisma.upload.findMany({
    where: { id: { in: arquivos.map((a) => a.id) }, company_id: companyId },
    select: { id: true, storage_key: true },
  });

  await prisma.upload.updateMany({
    where: { id: { in: registros.map((r) => r.id) }, company_id: companyId },
    data: { deleted_at: new Date() },
  });

  for (const registro of registros) {
    const caminho = caminhoDoArquivo(registro.storage_key);
    if (caminho) fs.rmSync(caminho, { force: true });
  }
}

/** As referências que estavam antes e não estão depois. */
export function referenciasRemovidas(antes: unknown, depois: unknown): string[] {
  const restantes = new Set(lerLista(depois));
  return lerLista(antes).filter((r) => !restantes.has(r));
}

/** `file_urls` é um array JSON guardado em texto; nunca confie que veio íntegro. */
export function lerLista(bruto: unknown): string[] {
  if (Array.isArray(bruto)) return bruto.filter((v): v is string => typeof v === 'string');
  if (typeof bruto !== 'string' || bruto.trim() === '') return [];
  try {
    const lista = JSON.parse(bruto);
    return Array.isArray(lista) ? lista.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}
