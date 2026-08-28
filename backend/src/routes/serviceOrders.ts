import { Router } from 'express';
import { prisma } from '../prisma';
import { requireCompanyId } from '../middleware/authMiddleware';
import {
  STATUS_OS,
  extrairCamposComuns,
  processarItens,
  proximoNumero,
  validarClienteEVeiculo,
} from '../lib/documentos';

const router = Router();

router.use(requireCompanyId);

const CAMPOS_DATA = ['entry_date', 'estimated_date', 'completion_date'] as const;

router.get('/', async (req, res) => {
  const orders = await prisma.serviceOrder.findMany({
    where: { company_id: req.companyId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(orders);
});

router.get('/:id', async (req, res) => {
  const order = await prisma.serviceOrder.findFirst({
    where: { id: req.params.id, company_id: req.companyId },
  });
  if (!order) return res.status(404).json({ error: 'Ordem de serviço não encontrada.' });
  res.json(order);
});

router.post('/', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const dados = extrairCamposComuns(body, STATUS_OS, CAMPOS_DATA);
  if ('__erro' in dados) return res.status(400).json({ error: dados.__erro });

  const clientId = typeof body.client_id === 'string' ? body.client_id.trim() : '';
  const vehicleId = typeof body.vehicle_id === 'string' ? body.vehicle_id.trim() : '';
  if (!clientId || !vehicleId) {
    return res.status(400).json({ error: 'Informe o cliente e o veículo da ordem de serviço.' });
  }

  const vinculo = await validarClienteEVeiculo(clientId, vehicleId, req.companyId);
  if ('erro' in vinculo) return res.status(400).json({ error: vinculo.erro });

  const resultado = processarItens(body.items, body.discount);
  if ('erro' in resultado) return res.status(400).json({ error: resultado.erro });

  try {
    const order = await prisma.serviceOrder.create({
      data: {
        ...dados,
        ...resultado.totais,
        items: JSON.stringify(resultado.itens),
        client_id: clientId,
        vehicle_id: vehicleId,
        client_name: vinculo.client_name,
        vehicle_info: vinculo.vehicle_info,
        company_id: req.companyId,
        order_number: await proximoNumero('os', req.companyId),
        entry_date: (dados.entry_date as Date | null | undefined) ?? new Date(),
      },
    });
    res.status(201).json(order);
  } catch (error) {
    res.status(400).json({ error: 'Não foi possível criar a ordem de serviço.' });
  }
});

router.put('/:id', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const dados = extrairCamposComuns(body, STATUS_OS, CAMPOS_DATA);
  if ('__erro' in dados) return res.status(400).json({ error: dados.__erro });

  const atual = await prisma.serviceOrder.findFirst({
    where: { id: req.params.id, company_id: req.companyId },
  });
  if (!atual) return res.status(404).json({ error: 'Ordem de serviço não encontrada.' });

  if (body.client_id !== undefined || body.vehicle_id !== undefined) {
    const clientId = typeof body.client_id === 'string' ? body.client_id.trim() : atual.client_id;
    const vehicleId = typeof body.vehicle_id === 'string' ? body.vehicle_id.trim() : atual.vehicle_id;

    const vinculo = await validarClienteEVeiculo(clientId, vehicleId, req.companyId);
    if ('erro' in vinculo) return res.status(400).json({ error: vinculo.erro });

    Object.assign(dados, {
      client_id: clientId,
      vehicle_id: vehicleId,
      client_name: vinculo.client_name,
      vehicle_info: vinculo.vehicle_info,
    });
  }

  // Recalcula sempre que a lista de itens vier — e nunca aceita total pronto.
  if (body.items !== undefined) {
    const resultado = processarItens(body.items, body.discount);
    if ('erro' in resultado) return res.status(400).json({ error: resultado.erro });
    Object.assign(dados, resultado.totais, { items: JSON.stringify(resultado.itens) });
  }

  // Concluir a OS carimba a data de conclusão, se ainda não houver uma.
  if (dados.status === 'completed' && !atual.completion_date && dados.completion_date === undefined) {
    dados.completion_date = new Date();
  }

  const { count } = await prisma.serviceOrder.updateMany({
    where: { id: req.params.id, company_id: req.companyId },
    data: dados,
  });
  if (count === 0) return res.status(404).json({ error: 'Ordem de serviço não encontrada.' });

  const order = await prisma.serviceOrder.findFirst({
    where: { id: req.params.id, company_id: req.companyId },
  });
  res.json(order);
});

router.delete('/:id', async (req, res) => {
  const { count } = await prisma.serviceOrder.deleteMany({
    where: { id: req.params.id, company_id: req.companyId },
  });
  if (count === 0) return res.status(404).json({ error: 'Ordem de serviço não encontrada.' });
  res.status(204).send();
});

export default router;
