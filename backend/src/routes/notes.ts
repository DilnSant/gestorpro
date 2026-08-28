import { Router } from 'express';
import { prisma } from '../prisma';
import { empresaDaRequisicao, rotaDaEmpresa } from '../middleware/authMiddleware';
import {
  carregarArquivos,
  excluirArquivos,
  lerLista,
  normalizarReferencias,
  referenciasRemovidas,
} from '../lib/anexos';

const router = Router();

router.use(rotaDaEmpresa);

const TIPOS = ['general', 'service_order', 'client', 'vehicle'] as const;
type Tipo = (typeof TIPOS)[number];

type DadosNota = {
  title?: string;
  content?: string | null;
  type?: string;
  related_id?: string | null;
};

function extrairCampos(body: unknown): DadosNota | { __erro: string } {
  const dados: DadosNota = {};
  if (typeof body !== 'object' || body === null) return dados;
  const origem = body as Record<string, unknown>;

  if (typeof origem.title === 'string') dados.title = origem.title.trim();

  if (origem.content !== undefined) {
    dados.content = origem.content === null ? null : String(origem.content);
  }

  if (origem.type !== undefined) {
    if (typeof origem.type !== 'string' || !TIPOS.includes(origem.type as Tipo)) {
      return { __erro: 'Tipo de nota inválido.' };
    }
    dados.type = origem.type;
  }

  if (origem.related_id !== undefined) {
    dados.related_id =
      typeof origem.related_id === 'string' && origem.related_id.trim() !== ''
        ? origem.related_id.trim()
        : null;
  }

  return dados;
}

/**
 * O `related_id` é polimórfico: aponta para OS, cliente ou veículo conforme o
 * tipo. Não aceita foreign key, então a checagem de tenant é feita aqui — sem
 * ela, uma nota poderia referenciar o registro de outra oficina (B5).
 */
async function vinculoValido(
  tipo: string | undefined,
  relatedId: string | null | undefined,
  companyId: string,
): Promise<boolean> {
  if (!relatedId) return true;
  if (tipo === 'client') {
    return (await prisma.client.count({ where: { id: relatedId, company_id: companyId } })) > 0;
  }
  if (tipo === 'vehicle') {
    return (await prisma.vehicle.count({ where: { id: relatedId, company_id: companyId } })) > 0;
  }
  if (tipo === 'service_order') {
    return (
      (await prisma.serviceOrder.count({ where: { id: relatedId, company_id: companyId } })) > 0
    );
  }
  // Nota geral não carrega vínculo.
  return false;
}

type NotaDoBanco = { file_urls: string | null };

async function serializar<T extends NotaDoBanco>(nota: T, companyId: string) {
  const { file_urls, ...resto } = nota;
  return { ...resto, files: await carregarArquivos(file_urls, companyId) };
}

router.get('/', async (req, res) => {
  const companyId = empresaDaRequisicao(req);
  const notas = await prisma.note.findMany({
    where: { company_id: companyId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(await Promise.all(notas.map((nota) => serializar(nota, companyId))));
});

router.post('/', async (req, res) => {
  const companyId = empresaDaRequisicao(req);
  const dados = extrairCampos(req.body);
  if ('__erro' in dados) return res.status(400).json({ error: dados.__erro });

  if (!dados.title) {
    return res.status(400).json({ error: 'O título da nota é obrigatório.' });
  }

  if (!(await vinculoValido(dados.type ?? 'general', dados.related_id, companyId))) {
    return res.status(400).json({ error: 'O registro vinculado não foi encontrado.' });
  }

  const anexos = await normalizarReferencias((req.body as Record<string, unknown>)?.file_urls, companyId);
  if ('erro' in anexos) return res.status(400).json({ error: anexos.erro });

  const nota = await prisma.note.create({
    data: {
      ...dados,
      title: dados.title,
      company_id: companyId,
      file_urls: JSON.stringify(anexos.referencias),
    },
  });
  res.status(201).json(await serializar(nota, companyId));
});

router.put('/:id', async (req, res) => {
  const companyId = empresaDaRequisicao(req);
  const id = req.params.id;

  const dados = extrairCampos(req.body);
  if ('__erro' in dados) return res.status(400).json({ error: dados.__erro });

  if (dados.title !== undefined && !dados.title) {
    return res.status(400).json({ error: 'O título da nota não pode ficar em branco.' });
  }

  const atual = await prisma.note.findFirst({ where: { id, company_id: companyId } });
  if (!atual) return res.status(404).json({ error: 'Nota não encontrada.' });

  const tipoFinal = dados.type ?? atual.type;
  const vinculoFinal = dados.related_id !== undefined ? dados.related_id : atual.related_id;
  if (!(await vinculoValido(tipoFinal, vinculoFinal, companyId))) {
    return res.status(400).json({ error: 'O registro vinculado não foi encontrado.' });
  }

  const corpo = (req.body ?? {}) as Record<string, unknown>;
  let referenciasFinais: string[] | null = null;

  if (corpo.file_urls !== undefined) {
    const anexos = await normalizarReferencias(corpo.file_urls, companyId);
    if ('erro' in anexos) return res.status(400).json({ error: anexos.erro });
    referenciasFinais = anexos.referencias;
  }

  const nota = await prisma.note.update({
    where: { id: atual.id },
    data: {
      ...dados,
      ...(referenciasFinais ? { file_urls: JSON.stringify(referenciasFinais) } : {}),
    },
  });

  // Anexo tirado da nota é apagado do disco: do contrário ficaria no volume para
  // sempre, sem dono e sem caminho de exclusão.
  if (referenciasFinais) {
    const removidos = referenciasRemovidas(lerLista(atual.file_urls), referenciasFinais);
    await excluirArquivos(removidos, companyId);
  }

  res.json(await serializar(nota, companyId));
});

router.delete('/:id', async (req, res) => {
  const companyId = empresaDaRequisicao(req);
  const nota = await prisma.note.findFirst({
    where: { id: req.params.id, company_id: companyId },
  });
  if (!nota) return res.status(404).json({ error: 'Nota não encontrada.' });

  await prisma.note.delete({ where: { id: nota.id } });
  await excluirArquivos(nota.file_urls, companyId);

  res.status(204).send();
});

export default router;
