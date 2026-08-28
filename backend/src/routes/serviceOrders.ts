import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { rotaDaEmpresa } from '../middleware/authMiddleware';
import {
  STATUS_OS,
  extrairCamposComuns,
  processarItens,
  proximoNumero,
  serializarDocumento,
  validarClienteEVeiculo,
} from '../lib/documentos';

const router = Router();

router.use(rotaDaEmpresa);

const CAMPOS_DATA = ['entry_date', 'estimated_date', 'completion_date'] as const;
const COM_ITENS = { items: { orderBy: { position: 'asc' } } } as const;

router.get('/', async (req, res) => {
  const ordens = await prisma.serviceOrder.findMany({
    where: { company_id: req.companyId },
    orderBy: { createdAt: 'desc' },
    include: COM_ITENS,
  });
  res.json(ordens.map(serializarDocumento));
});

router.get('/:id', async (req, res) => {
  const ordem = await prisma.serviceOrder.findFirst({
    where: { id: req.params.id, company_id: req.companyId },
    include: COM_ITENS,
  });
  if (!ordem) return res.status(404).json({ error: 'Ordem de serviço não encontrada.' });
  res.json(serializarDocumento(ordem));
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

  const snapshots = await validarClienteEVeiculo(clientId, vehicleId, req.companyId);
  if ('erro' in snapshots) return res.status(400).json({ error: snapshots.erro });

  const resultado = processarItens(body.items, body.discount);
  if ('erro' in resultado) return res.status(400).json({ error: resultado.erro });

  // Duas requisições simultâneas podem calcular o mesmo número. O @@unique
  // transforma isso em P2002 e o retry pega o número seguinte.
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      const ordem = await prisma.serviceOrder.create({
        data: {
          ...dados,
          ...resultado.totais,
          ...snapshots,
          client_id: clientId,
          vehicle_id: vehicleId,
          company_id: req.companyId,
          order_number: await proximoNumero('os', req.companyId),
          entry_date: (dados.entry_date as Date | null | undefined) ?? new Date(),
          items: {
            create: resultado.itens.map((item) => ({ ...item, company_id: req.companyId })),
          },
        },
        include: COM_ITENS,
      });
      return res.status(201).json(serializarDocumento(ordem));
    } catch (error) {
      const numeroEmUso =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
      if (!numeroEmUso) {
        return res.status(400).json({ error: 'Não foi possível criar a ordem de serviço.' });
      }
    }
  }

  res.status(409).json({ error: 'Muitas ordens sendo criadas ao mesmo tempo. Tente de novo.' });
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
    const vehicleId =
      typeof body.vehicle_id === 'string' ? body.vehicle_id.trim() : atual.vehicle_id;

    const snapshots = await validarClienteEVeiculo(clientId, vehicleId, req.companyId);
    if ('erro' in snapshots) return res.status(400).json({ error: snapshots.erro });

    Object.assign(dados, snapshots, { client_id: clientId, vehicle_id: vehicleId });
  }

  // Concluir a OS carimba a data, se ainda não houver uma.
  if (dados.status === 'completed' && !atual.completion_date && dados.completion_date === undefined) {
    dados.completion_date = new Date();
  }

  let itensNovos: Awaited<ReturnType<typeof processarItens>> | null = null;
  if (body.items !== undefined) {
    itensNovos = processarItens(body.items, body.discount);
    if ('erro' in itensNovos) return res.status(400).json({ error: itensNovos.erro });
    Object.assign(dados, itensNovos.totais);
  }

  // Troca de itens e totais na mesma transação: sem isso, uma falha ao inserir os
  // novos itens deixaria os totais já gravados sem os itens que os justificam.
  const ordem = await prisma.$transaction(async (tx) => {
    if (itensNovos && 'itens' in itensNovos) {
      await tx.serviceOrderItem.deleteMany({ where: { service_order_id: atual.id } });
      await tx.serviceOrderItem.createMany({
        data: itensNovos.itens.map((item) => ({
          ...item,
          service_order_id: atual.id,
          company_id: req.companyId,
        })),
      });
    }
    return tx.serviceOrder.update({
      where: { id: atual.id },
      data: dados,
      include: COM_ITENS,
    });
  });

  res.json(serializarDocumento(ordem));
});

router.delete('/:id', async (req, res) => {
  const { count } = await prisma.serviceOrder.deleteMany({
    where: { id: req.params.id, company_id: req.companyId },
  });
  if (count === 0) return res.status(404).json({ error: 'Ordem de serviço não encontrada.' });
  res.status(204).send();
});

export default router;
