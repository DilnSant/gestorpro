import { Router } from 'express';
import { prisma } from '../prisma';
import { rotaDaEmpresa } from '../middleware/authMiddleware';

const router = Router();

router.use(rotaDaEmpresa);

// `plate` é obrigatória no schema e não aceita null; as demais são opcionais.
const CAMPOS_TEXTO = ['brand', 'model', 'color', 'chassis'] as const;
const CAMPOS_NUMERO = ['year', 'km'] as const;

type DadosVeiculo = {
  client_id?: string;
  plate?: string;
  brand?: string | null;
  model?: string | null;
  color?: string | null;
  chassis?: string | null;
  year?: number | null;
  km?: number | null;
};

function extrairCampos(body: unknown): DadosVeiculo {
  const dados: DadosVeiculo = {};
  if (typeof body !== 'object' || body === null) return dados;
  const origem = body as Record<string, unknown>;

  if (typeof origem.plate === 'string') {
    dados.plate = origem.plate.trim();
  }

  for (const campo of CAMPOS_TEXTO) {
    const valor = origem[campo];
    if (valor === undefined) continue;
    if (valor === null) dados[campo] = null;
    else if (typeof valor === 'string') dados[campo] = valor.trim();
  }

  for (const campo of CAMPOS_NUMERO) {
    const valor = origem[campo];
    if (valor === undefined) continue;
    if (valor === null || valor === '') {
      dados[campo] = null;
    } else {
      const numero = Number(valor);
      if (Number.isFinite(numero)) dados[campo] = Math.trunc(numero);
    }
  }

  if (typeof origem.client_id === 'string' && origem.client_id.trim() !== '') {
    dados.client_id = origem.client_id.trim();
  }

  // Placa é identificador natural: "ABC-1234", "abc1234" e "ABC1234" são o mesmo
  // carro. Normalizar na borda evita três cadastros para o mesmo veículo.
  if (dados.plate !== undefined && dados.plate !== null) {
    dados.plate = dados.plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  return dados;
}

// O client_id chega do cliente. Sem esta checagem dá para cadastrar um veículo na
// própria empresa apontando para o cliente de outra — a FK aceita, porque o banco
// não sabe nada sobre tenant.
async function clientePertenceAEmpresa(clientId: string, companyId: string) {
  const cliente = await prisma.client.findFirst({
    where: { id: clientId, company_id: companyId },
    select: { id: true },
  });
  return cliente !== null;
}

router.get('/', async (req, res) => {
  const vehicles = await prisma.vehicle.findMany({
    where: { company_id: req.companyId },
    include: { client: { select: { id: true, name: true } } },
    orderBy: { plate: 'asc' },
  });
  res.json(vehicles);
});

router.post('/', async (req, res) => {
  const dados = extrairCampos(req.body);

  if (!dados.plate) {
    return res.status(400).json({ error: 'A placa é obrigatória.' });
  }
  if (!dados.client_id) {
    return res.status(400).json({ error: 'Informe o cliente dono do veículo.' });
  }
  if (!(await clientePertenceAEmpresa(dados.client_id, req.companyId))) {
    return res.status(400).json({ error: 'Cliente não encontrado.' });
  }

  try {
    const vehicle = await prisma.vehicle.create({
      data: {
        ...dados,
        plate: dados.plate,
        client_id: dados.client_id,
        company_id: req.companyId,
      },
    });
    res.status(201).json(vehicle);
  } catch (error) {
    res.status(400).json({ error: 'Não foi possível cadastrar o veículo.' });
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const dados = extrairCampos(req.body);

  if (dados.plate !== undefined && !dados.plate) {
    return res.status(400).json({ error: 'A placa não pode ficar em branco.' });
  }
  if (dados.client_id && !(await clientePertenceAEmpresa(dados.client_id, req.companyId))) {
    return res.status(400).json({ error: 'Cliente não encontrado.' });
  }

  const { count } = await prisma.vehicle.updateMany({
    where: { id, company_id: req.companyId },
    data: dados,
  });

  if (count === 0) {
    return res.status(404).json({ error: 'Veículo não encontrado.' });
  }

  const vehicle = await prisma.vehicle.findFirst({ where: { id, company_id: req.companyId } });
  res.json(vehicle);
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  const { count } = await prisma.vehicle.deleteMany({
    where: { id, company_id: req.companyId },
  });

  if (count === 0) {
    return res.status(404).json({ error: 'Veículo não encontrado.' });
  }

  res.status(204).send();
});

export default router;
