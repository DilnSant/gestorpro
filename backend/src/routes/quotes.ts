import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { empresaDaRequisicao, rotaDaEmpresa } from '../middleware/authMiddleware';
import {
  STATUS_ORCAMENTO,
  extrairCamposComuns,
  processarItens,
  proximoNumero,
  serializarDocumento,
  validarClienteEVeiculo,
} from '../lib/documentos';

const router = Router();

router.use(rotaDaEmpresa);

const CAMPOS_DATA = ['valid_until'] as const;
const COM_ITENS = { items: { orderBy: { position: 'asc' } } } as const;

router.get('/', async (req, res) => {
  const orcamentos = await prisma.quote.findMany({
    where: { company_id: empresaDaRequisicao(req) },
    orderBy: { createdAt: 'desc' },
    include: COM_ITENS,
  });
  res.json(orcamentos.map(serializarDocumento));
});

router.get('/:id', async (req, res) => {
  const orcamento = await prisma.quote.findFirst({
    where: { id: req.params.id, company_id: empresaDaRequisicao(req) },
    include: COM_ITENS,
  });
  if (!orcamento) return res.status(404).json({ error: 'Orçamento não encontrado.' });
  res.json(serializarDocumento(orcamento));
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

  const snapshots = await validarClienteEVeiculo(clientId, vehicleId, empresaDaRequisicao(req));
  if ('erro' in snapshots) return res.status(400).json({ error: snapshots.erro });

  const resultado = processarItens(body.items, body.discount);
  if ('erro' in resultado) return res.status(400).json({ error: resultado.erro });

  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      const orcamento = await prisma.quote.create({
        data: {
          ...dados,
          ...resultado.totais,
          ...snapshots,
          client_id: clientId,
          vehicle_id: vehicleId,
          company_id: empresaDaRequisicao(req),
          quote_number: await proximoNumero('orcamento', empresaDaRequisicao(req)),
          items: {
            create: resultado.itens.map((item) => ({ ...item, company_id: empresaDaRequisicao(req) })),
          },
        },
        include: COM_ITENS,
      });
      return res.status(201).json(serializarDocumento(orcamento));
    } catch (error) {
      const numeroEmUso =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
      if (!numeroEmUso) {
        return res.status(400).json({ error: 'Não foi possível criar o orçamento.' });
      }
    }
  }

  res.status(409).json({ error: 'Muitos orçamentos sendo criados ao mesmo tempo. Tente de novo.' });
});

router.put('/:id', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const dados = extrairCamposComuns(body, STATUS_ORCAMENTO, CAMPOS_DATA);
  if ('__erro' in dados) return res.status(400).json({ error: dados.__erro });

  const atual = await prisma.quote.findFirst({
    where: { id: req.params.id, company_id: empresaDaRequisicao(req) },
  });
  if (!atual) return res.status(404).json({ error: 'Orçamento não encontrado.' });

  // Um orçamento já convertido em OS não pode mais mudar: a ordem foi gerada a
  // partir destes valores e passaria a divergir do documento que a originou.
  if (atual.status === 'converted') {
    return res
      .status(409)
      .json({ error: 'Este orçamento já virou ordem de serviço e não pode mais ser alterado.' });
  }

  if (body.client_id !== undefined || body.vehicle_id !== undefined) {
    const clientId = typeof body.client_id === 'string' ? body.client_id.trim() : atual.client_id;
    const vehicleId =
      typeof body.vehicle_id === 'string' ? body.vehicle_id.trim() : atual.vehicle_id;

    const snapshots = await validarClienteEVeiculo(clientId, vehicleId, empresaDaRequisicao(req));
    if ('erro' in snapshots) return res.status(400).json({ error: snapshots.erro });

    Object.assign(dados, snapshots, { client_id: clientId, vehicle_id: vehicleId });
  }

  let itensNovos: ReturnType<typeof processarItens> | null = null;
  if (body.items !== undefined) {
    itensNovos = processarItens(body.items, body.discount);
    if ('erro' in itensNovos) return res.status(400).json({ error: itensNovos.erro });
    Object.assign(dados, itensNovos.totais);
  }

  const orcamento = await prisma.$transaction(async (tx) => {
    if (itensNovos && 'itens' in itensNovos) {
      await tx.quoteItem.deleteMany({ where: { quote_id: atual.id } });
      await tx.quoteItem.createMany({
        data: itensNovos.itens.map((item) => ({
          ...item,
          quote_id: atual.id,
          company_id: empresaDaRequisicao(req),
        })),
      });
    }
    return tx.quote.update({ where: { id: atual.id }, data: dados, include: COM_ITENS });
  });

  res.json(serializarDocumento(orcamento));
});

/**
 * Converte o orçamento em ordem de serviço.
 *
 * Tudo numa transação: sem ela, uma falha depois de criar a OS deixaria o
 * orçamento marcado como convertido apontando para uma ordem que não existe — ou
 * geraria uma OS nova a cada clique.
 */
router.post('/:id/convert', async (req, res) => {
  const orcamento = await prisma.quote.findFirst({
    where: { id: req.params.id, company_id: empresaDaRequisicao(req) },
    include: COM_ITENS,
  });

  if (!orcamento) return res.status(404).json({ error: 'Orçamento não encontrado.' });
  if (orcamento.status === 'converted') {
    return res.status(409).json({ error: 'Este orçamento já foi convertido em ordem de serviço.' });
  }
  if (orcamento.status === 'rejected') {
    return res.status(409).json({ error: 'Um orçamento recusado não pode virar ordem de serviço.' });
  }
  if (orcamento.items.length === 0) {
    return res.status(409).json({ error: 'Um orçamento sem itens não pode virar ordem de serviço.' });
  }

  try {
    const ordem = await prisma.$transaction(async (tx) => {
      const ultima = await tx.serviceOrder.findFirst({
        where: { company_id: empresaDaRequisicao(req) },
        orderBy: { order_number: 'desc' },
        select: { order_number: true },
      });
      const sequencial = ultima ? Number.parseInt(ultima.order_number.replace(/\D/g, ''), 10) : 0;
      const proximo = Number.isFinite(sequencial) ? sequencial + 1 : 1;

      const nova = await tx.serviceOrder.create({
        data: {
          company_id: orcamento.company_id,
          order_number: `OS-${String(proximo).padStart(4, '0')}`,
          client_id: orcamento.client_id,
          vehicle_id: orcamento.vehicle_id,
          // Os snapshots viajam junto: a OS herda os dados congelados na emissão
          // do orçamento, não os dados atuais do cadastro.
          client_name_snapshot: orcamento.client_name_snapshot,
          vehicle_plate_snapshot: orcamento.vehicle_plate_snapshot,
          vehicle_desc_snapshot: orcamento.vehicle_desc_snapshot,
          status: 'pending',
          entry_date: new Date(),
          description: orcamento.description,
          notes: orcamento.notes,
          labor_total_cents: orcamento.labor_total_cents,
          parts_total_cents: orcamento.parts_total_cents,
          discount_cents: orcamento.discount_cents,
          total_amount_cents: orcamento.total_amount_cents,
          from_quote_id: orcamento.id,
          items: {
            create: orcamento.items.map((item) => ({
              company_id: item.company_id,
              type: item.type,
              description: item.description,
              quantity: item.quantity,
              unit_price_cents: item.unit_price_cents,
              total_cents: item.total_cents,
              position: item.position,
            })),
          },
        },
        include: COM_ITENS,
      });

      await tx.quote.update({ where: { id: orcamento.id }, data: { status: 'converted' } });
      return nova;
    });

    res.status(201).json(serializarDocumento(ordem));
  } catch (error) {
    res.status(400).json({ error: 'Não foi possível converter o orçamento.' });
  }
});

router.delete('/:id', async (req, res) => {
  const orcamento = await prisma.quote.findFirst({
    where: { id: req.params.id, company_id: empresaDaRequisicao(req) },
    select: { id: true, status: true },
  });
  if (!orcamento) return res.status(404).json({ error: 'Orçamento não encontrado.' });

  if (orcamento.status === 'converted') {
    return res
      .status(409)
      .json({ error: 'Este orçamento gerou uma ordem de serviço e não pode ser excluído.' });
  }

  await prisma.quote.delete({ where: { id: orcamento.id } });
  res.status(204).send();
});

export default router;
