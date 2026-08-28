import { Router } from 'express';
import { prisma } from '../prisma';
import { rotaDaEmpresa } from '../middleware/authMiddleware';

const router = Router();

router.use(rotaDaEmpresa);

const TIPOS = ['general', 'service_order', 'client', 'vehicle'] as const;

type DadosNota = {
  title?: string;
  content?: string | null;
  type?: string;
  related_id?: string | null;
  file_urls?: string | null;
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
    if (typeof origem.type !== 'string' || !TIPOS.includes(origem.type as (typeof TIPOS)[number])) {
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

  // O schema guarda os anexos como JSON em texto (o conector SQLite do Prisma não
  // suporta o tipo Json). Serializar aqui evita gravar "[object Object]".
  if (origem.file_urls !== undefined) {
    const bruto = origem.file_urls;
    let lista: unknown = bruto;
    if (typeof bruto === 'string') {
      try {
        lista = JSON.parse(bruto);
      } catch {
        return { __erro: 'A lista de anexos está em formato inválido.' };
      }
    }
    if (lista === null) {
      dados.file_urls = null;
    } else if (Array.isArray(lista) && lista.every((u) => typeof u === 'string')) {
      dados.file_urls = JSON.stringify(lista);
    } else {
      return { __erro: 'A lista de anexos está em formato inválido.' };
    }
  }

  return dados;
}

router.get('/', async (req, res) => {
  const notes = await prisma.note.findMany({
    where: { company_id: req.companyId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(notes);
});

router.post('/', async (req, res) => {
  const dados = extrairCampos(req.body);
  if ('__erro' in dados) return res.status(400).json({ error: dados.__erro });

  if (!dados.title) {
    return res.status(400).json({ error: 'O título da nota é obrigatório.' });
  }

  try {
    const note = await prisma.note.create({
      data: { ...dados, title: dados.title, company_id: req.companyId },
    });
    res.status(201).json(note);
  } catch (error) {
    res.status(400).json({ error: 'Não foi possível criar a nota.' });
  }
});

router.put('/:id', async (req, res) => {
  const dados = extrairCampos(req.body);
  if ('__erro' in dados) return res.status(400).json({ error: dados.__erro });

  if (dados.title !== undefined && !dados.title) {
    return res.status(400).json({ error: 'O título da nota não pode ficar em branco.' });
  }

  const { count } = await prisma.note.updateMany({
    where: { id: req.params.id, company_id: req.companyId },
    data: dados,
  });
  if (count === 0) return res.status(404).json({ error: 'Nota não encontrada.' });

  const note = await prisma.note.findFirst({
    where: { id: req.params.id, company_id: req.companyId },
  });
  res.json(note);
});

router.delete('/:id', async (req, res) => {
  const { count } = await prisma.note.deleteMany({
    where: { id: req.params.id, company_id: req.companyId },
  });
  if (count === 0) return res.status(404).json({ error: 'Nota não encontrada.' });
  res.status(204).send();
});

export default router;
