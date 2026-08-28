import { Router } from 'express';
import { prisma } from '../prisma';
import { requireCompanyId } from '../middleware/authMiddleware';
import {
  STATUS_ORCAMENTO,
  extrairCamposComuns,
  processarItens,
  proximoNumero,
  validarClienteEVeiculo,
} from '../lib/documentos';

const router = Router();

router.use(requireCompanyId);

const CAMPOS_DATA = ['valid_until'] as const;

router.get('/', async (req, res) => {
  const quotes = await prisma.quote.findMany({
    where: { company_id: req.companyId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(quotes);
});

router.get('/:id', async (req, res) => {
  const quote = await prisma.quote.findFirst({
    where: { id: req.params.id, company_id: req.companyId },
  });
  if (!quote) return res.status(404).json({ error: 'Orçamento não encontrado.' });
  res.json(quote);
});

router.post('/', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const dados = extrairCamposComuns(body, STATUS_ORCAMENTO, CAMPOS_DATA);
  if ('__erro' in dados) return res.status(400).json({ error: dados.__erro });

  const clientId = typeof body.client_id === 'string' ? body.client_id.trim() : '';
  const vehicleId = typeof body.vehicle_id === 'string' ? body.vehicle_id.trim() : '';
  if (!clientId || !vehicleId) {
    return res.status(400).json({ error: 'Informe o cliente e o veículo do orçamento.' });
  }

  const vinculo = await validarClienteEVeiculo(clientId, vehicleId, req.companyId);
  if ('erro' in vinculo) return res.status(400).json({ error: vinculo.erro });

  const resultado = processarItens(body.items, body.discount);
  if ('erro' in resultado) return res.status(400).json({ error: resultado.erro });

  try {
    const quote = await prisma.quote.create({
      data: {
        ...dados,
        ...resultado.totais,
        items: JSON.stringify(resultado.itens),
        client_id: clientId,
        vehicle_id: vehicleId,
        client_name: vinculo.client_name,
        vehicle_info: vinculo.vehicle_info,
        company_id: req.companyId,
        quote_number: await proximoNumero('orcamento', req.companyId),
      },
    });
    res.status(201).json(quote);
  } catch (error) {
    res.status(400).json({ error: 'Não foi possível criar o orçamento.' });
  }
});

router.put('/:id', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const dados = extrairCamposComuns(body, STATUS_ORCAMENTO, CAMPOS_DATA);
  if ('__erro' in dados) return res.status(400).json({ error: dados.__erro });

  const atual = await prisma.quote.findFirst({
    where: { id: req.params.id, company_id: req.companyId },
  });
  if (!atual) return res.status(404).json({ error: 'Orçamento não encontrado.' });

  // Um orçamento já convertido em OS não pode mais ser editado: a OS foi gerada a
  // partir destes valores e passaria a divergir do documento que a originou.
  if (atual.status === 'converted') {
    return res
      .status(409)
      .json({ error: 'Este orçamento já virou ordem de serviço e não pode mais ser alterado.' });
  }

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

  if (body.items !== undefined) {
    const resultado = processarItens(body.items, body.discount);
    if ('erro' in resultado) return res.status(400).json({ error: resultado.erro });
    Object.assign(dados, resultado.totais, { items: JSON.stringify(resultado.itens) });
  }

  const { count } = await prisma.quote.updateMany({
    where: { id: req.params.id, company_id: req.companyId },
    data: dados,
  });
  if (count === 0) return res.status(404).json({ error: 'Orçamento não encontrado.' });

  const quote = await prisma.quote.findFirst({
    where: { id: req.params.id, company_id: req.companyId },
  });
  res.json(quote);
});

/**
 * Converte o orçamento em ordem de serviço.
 *
 * Roda dentro de uma transação: sem ela, uma falha depois de criar a OS deixaria o
 * orçamento marcado como convertido apontando para uma OS que não existe — ou o
 * contrário, uma OS órfã que pode ser gerada de novo a cada clique.
 */
router.post('/:id/convert', async (req, res) => {
  const quote = await prisma.quote.findFirst({
    where: { id: req.params.id, company_id: req.companyId },
  });

  if (!quote) return res.status(404).json({ error: 'Orçamento não encontrado.' });
  if (quote.status === 'converted') {
    return res.status(409).json({ error: 'Este orçamento já foi convertido em ordem de serviço.' });
  }
  if (quote.status === 'rejected') {
    return res.status(409).json({ error: 'Um orçamento recusado não pode virar ordem de serviço.' });
  }

  try {
    const order = await prisma.$transaction(async (tx) => {
      const ultima = await tx.serviceOrder.findFirst({
        where: { company_id: req.companyId },
        orderBy: { order_number: 'desc' },
        select: { order_number: true },
      });
      const sequencial = ultima ? Number.parseInt(ultima.order_number.replace(/\D/g, ''), 10) : 0;
      const proximo = Number.isFinite(sequencial) ? sequencial + 1 : 1;

      const novaOS = await tx.serviceOrder.create({
        data: {
          company_id: quote.company_id,
          order_number: `OS-${String(proximo).padStart(4, '0')}`,
          client_id: quote.client_id,
          client_name: quote.client_name,
          vehicle_id: quote.vehicle_id,
          vehicle_info: quote.vehicle_info,
          status: 'pending',
          entry_date: new Date(),
          description: quote.description,
          items: quote.items,
          labor_total: quote.labor_total,
          parts_total: quote.parts_total,
          discount: quote.discount,
          total_amount: quote.total_amount,
          notes: quote.notes,
          from_quote_id: quote.id,
        },
      });

      await tx.quote.update({
        where: { id: quote.id },
        data: { status: 'converted', converted_to_os_id: novaOS.id },
      });

      return novaOS;
    });

    res.status(201).json(order);
  } catch (error) {
    res.status(400).json({ error: 'Não foi possível converter o orçamento.' });
  }
});

router.delete('/:id', async (req, res) => {
  const quote = await prisma.quote.findFirst({
    where: { id: req.params.id, company_id: req.companyId },
    select: { status: true },
  });
  if (!quote) return res.status(404).json({ error: 'Orçamento não encontrado.' });

  if (quote.status === 'converted') {
    return res
      .status(409)
      .json({ error: 'Este orçamento gerou uma ordem de serviço e não pode ser excluído.' });
  }

  await prisma.quote.deleteMany({ where: { id: req.params.id, company_id: req.companyId } });
  res.status(204).send();
});

export default router;
