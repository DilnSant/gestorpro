import { Router } from 'express';
import { prisma } from '../prisma';
import { empresaDaRequisicao, exigirAutenticacao, exigirEmpresa } from '../middleware/authMiddleware';
import { verificarToken } from '../lib/auth';
import {
  podeExibirInline,
  MIMES_PERMITIDOS,
  verificarTokenArquivo,
} from '../lib/arquivos';

const router = Router();

/** Express 5 tipa parâmetro de rota como string | string[]; só a forma simples serve. */
const idDaRota = (valor: unknown): string | null =>
  typeof valor === 'string' && valor.trim() !== '' ? valor : null;

/**
 * Leitura de arquivo.
 *
 * Duas credenciais aceitas, nesta ordem:
 *   1. `?t=` — URL assinada. É o que faz `<img src>` e `<a href>` funcionarem: a
 *      requisição é feita pelo browser, que não envia header nenhum.
 *   2. `Authorization: Bearer` — caminho programático, usado pelos testes.
 *
 * Arquivo de outro tenant responde 404, não 403 — mesma convenção do resto da API:
 * não confirma que o recurso existe.
 */
router.get('/:id', async (req, res) => {
  const id = idDaRota(req.params.id);
  if (!id) return res.status(404).json({ error: 'Arquivo não encontrado.' });

  let companyId: string | null = null;

  const assinado = typeof req.query.t === 'string' ? req.query.t : null;
  if (assinado) {
    const conteudo = verificarTokenArquivo(assinado);
    if (!conteudo) {
      return res.status(403).json({ error: 'Link de arquivo inválido ou expirado.' });
    }
    // O token fixa o arquivo: um link do arquivo A não serve para o arquivo B.
    if (conteudo.fid !== id) {
      return res.status(403).json({ error: 'Link de arquivo inválido.' });
    }
    companyId = conteudo.cid;
  } else {
    // Sem link assinado, cai no caminho normal de sessão.
    const cabecalho = req.headers.authorization;
    const bearer =
      typeof cabecalho === 'string' && cabecalho.startsWith('Bearer ')
        ? cabecalho.slice(7)
        : null;

    const sessao = bearer ? verificarToken(bearer) : null;
    if (!sessao) return res.status(401).json({ error: 'Faça login para continuar.' });

    if (!sessao.company_id) {
      return res.status(403).json({ error: 'Nenhuma oficina selecionada.' });
    }
    companyId = sessao.company_id;
  }

  // Nunca findUnique por id seguido de comparação em JS: o filtro por empresa faz
  // parte da consulta.
  const arquivo = await prisma.upload.findFirst({
    where: { id, company_id: companyId, deleted_at: null },
  });
  if (!arquivo) return res.status(404).json({ error: 'Arquivo não encontrado.' });

  const mime = MIMES_PERMITIDOS.has(arquivo.mime_type)
    ? arquivo.mime_type
    : 'application/octet-stream';

  // Content-Disposition é o que impede execução no contexto da origem da API:
  // só imagem e PDF são exibidos; o resto vira download.
  const disposicao = podeExibirInline(mime)
    ? 'inline'
    : `attachment; filename*=UTF-8''${encodeURIComponent(arquivo.original_name)}`;

  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', disposicao);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Referrer-Policy', 'no-referrer');
  // Nunca `public`: é conteúdo de um tenant. O max-age acompanha o bucket do token.
  res.setHeader('Cache-Control', 'private, max-age=300');
  if (arquivo.checksum_sha256) res.setHeader('ETag', `"${arquivo.checksum_sha256}"`);

  res.setHeader('Content-Length', String(arquivo.data.length));
  res.end(arquivo.data);
});

/** Exclusão pelo dono. Soft delete no banco, remoção física do disco. */
router.delete('/:id', exigirAutenticacao, exigirEmpresa, async (req, res) => {
  const companyId = empresaDaRequisicao(req);
  const id = idDaRota(req.params.id);
  if (!id) return res.status(404).json({ error: 'Arquivo não encontrado.' });

  const arquivo = await prisma.upload.findFirst({
    where: { id, company_id: companyId, deleted_at: null },
  });
  if (!arquivo) return res.status(404).json({ error: 'Arquivo não encontrado.' });

  // Os bytes vão embora junto com o soft delete: a trilha fica, o conteúdo não.
  await prisma.upload.update({
    where: { id: arquivo.id },
    data: { deleted_at: new Date(), data: Buffer.alloc(0) },
  });

  res.status(204).send();
});

export default router;
