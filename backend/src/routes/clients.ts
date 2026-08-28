import { Router } from 'express';
import { prisma } from '../prisma';
import { empresaDaRequisicao, rotaDaEmpresa } from '../middleware/authMiddleware';

const router = Router();

// Aplica o middleware em todas as rotas de clientes
router.use(rotaDaEmpresa);

// Só estes campos vêm do cliente. Antes era `...req.body` espalhado direto no
// Prisma, o que deixava a requisição definir `id`, `createdAt` e — no PUT, que
// não reaplicava o company_id — mover o registro para outra empresa.
// `name` é obrigatório no schema e não aceita null; os demais são opcionais e
// podem ser limpos com null.
const CAMPOS_OPCIONAIS = ['cpf_cnpj', 'phone', 'email', 'address', 'notes'] as const;

type DadosCliente = { name?: string } & Partial<
  Record<(typeof CAMPOS_OPCIONAIS)[number], string | null>
>;

function extrairCampos(body: unknown): DadosCliente {
  const dados: DadosCliente = {};
  if (typeof body !== 'object' || body === null) return dados;
  const origem = body as Record<string, unknown>;

  if (typeof origem.name === 'string') {
    dados.name = origem.name.trim();
  }

  for (const campo of CAMPOS_OPCIONAIS) {
    const valor = origem[campo];
    if (valor === undefined) continue;
    if (valor === null) {
      dados[campo] = null;
    } else if (typeof valor === 'string') {
      dados[campo] = valor.trim();
    }
  }
  return dados;
}

router.get('/', async (req, res) => {
  const clients = await prisma.client.findMany({
    where: { company_id: empresaDaRequisicao(req) },
    orderBy: { name: 'asc' },
  });
  res.json(clients);
});

router.post('/', async (req, res) => {
  const dados = extrairCampos(req.body);

  if (!dados.name) {
    return res.status(400).json({ error: 'O nome do cliente é obrigatório.' });
  }

  try {
    const client = await prisma.client.create({
      data: { ...dados, name: dados.name, company_id: empresaDaRequisicao(req) },
    });
    res.status(201).json(client);
  } catch (error) {
    res.status(400).json({ error: 'Não foi possível cadastrar o cliente.' });
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const dados = extrairCampos(req.body);

  if (dados.name !== undefined && !dados.name) {
    return res.status(400).json({ error: 'O nome do cliente não pode ficar em branco.' });
  }

  // updateMany em vez de update: o `where` composto garante que só uma linha da
  // própria empresa é alcançada, e o count permite responder 404 em vez de vazar
  // a existência de um cliente de outra empresa.
  const { count } = await prisma.client.updateMany({
    where: { id, company_id: empresaDaRequisicao(req) },
    data: dados,
  });

  if (count === 0) {
    return res.status(404).json({ error: 'Cliente não encontrado.' });
  }

  const client = await prisma.client.findFirst({ where: { id, company_id: empresaDaRequisicao(req) } });
  res.json(client);
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  const { count } = await prisma.client.deleteMany({
    where: { id, company_id: empresaDaRequisicao(req) },
  });

  if (count === 0) {
    return res.status(404).json({ error: 'Cliente não encontrado.' });
  }

  res.status(204).send();
});

export default router;
