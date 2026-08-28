import { Router } from 'express';
import { prisma } from '../prisma';
import { paraReais } from '../lib/dinheiro';
import { exigirAdmin, exigirAutenticacao, rotaDaEmpresa } from '../middleware/authMiddleware';

const router = Router();

// `name` e `primary_color` são obrigatórios no schema (o segundo tem default) e
// não aceitam null; os demais são opcionais e podem ser limpos.
const CAMPOS_OPCIONAIS = ['logo_url', 'phone', 'email', 'address', 'cnpj', 'domain'] as const;

type DadosEmpresa = { name?: string; primary_color?: string } & Partial<
  Record<(typeof CAMPOS_OPCIONAIS)[number], string | null>
>;

function extrairCampos(body: unknown): DadosEmpresa | { __erro: string } {
  const dados: DadosEmpresa = {};
  if (typeof body !== 'object' || body === null) return dados;
  const origem = body as Record<string, unknown>;

  if (typeof origem.name === 'string') dados.name = origem.name.trim();
  if (typeof origem.primary_color === 'string') dados.primary_color = origem.primary_color.trim();

  for (const campo of CAMPOS_OPCIONAIS) {
    const valor = origem[campo];
    if (valor === undefined) continue;
    if (valor === null) dados[campo] = null;
    else if (typeof valor === 'string') dados[campo] = valor.trim() || null;
  }

  // A cor vai direto para uma CSS custom property no frontend. Sem esta validação,
  // qualquer string entraria numa folha de estilo.
  if (dados.primary_color && !/^#[0-9a-fA-F]{6}$/.test(dados.primary_color)) {
    return { __erro: 'A cor deve estar no formato #RRGGBB.' };
  }

  return dados;
}

// ---------------------------------------------------------------------------
// Painel administrativo — só o dono da plataforma.
//
// O papel vem do token assinado. Antes esta rota era pública: qualquer um listava
// todas as empresas cadastradas, com estatísticas.
// ---------------------------------------------------------------------------
router.get('/admin/all', exigirAutenticacao, exigirAdmin, async (_req, res) => {
  const empresas = await prisma.company.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { clients: true, vehicles: true, serviceOrders: true, quotes: true } },
    },
  });

  res.json(
    empresas.map((empresa) => ({
      id: empresa.id,
      name: empresa.name,
      logo_url: empresa.logo_url,
      primary_color: empresa.primary_color,
      phone: empresa.phone,
      email: empresa.email,
      cnpj: empresa.cnpj,
      createdAt: empresa.createdAt,
      stats: {
        clients: empresa._count.clients,
        vehicles: empresa._count.vehicles,
        serviceOrders: empresa._count.serviceOrders,
        quotes: empresa._count.quotes,
      },
    })),
  );
});

// A partir daqui tudo é escopado à empresa do token.
router.use(rotaDaEmpresa);

router.get('/', async (req, res) => {
  const empresa = await prisma.company.findUnique({ where: { id: req.companyId } });
  if (!empresa) return res.status(404).json({ error: 'Empresa não encontrada.' });
  res.json(empresa);
});

router.put('/', async (req, res) => {
  const dados = extrairCampos(req.body);
  if ('__erro' in dados) return res.status(400).json({ error: dados.__erro });

  if (dados.name !== undefined && !dados.name) {
    return res.status(400).json({ error: 'O nome da empresa não pode ficar em branco.' });
  }

  try {
    // updateMany garante que a empresa alterada é a da requisição.
    const { count } = await prisma.company.updateMany({
      where: { id: req.companyId },
      data: dados,
    });
    if (count === 0) return res.status(404).json({ error: 'Empresa não encontrada.' });
  } catch (error) {
    return res.status(409).json({ error: 'Já existe outra empresa com esse CNPJ ou domínio.' });
  }

  const empresa = await prisma.company.findUnique({ where: { id: req.companyId } });
  res.json(empresa);
});

/** Números do painel inicial, calculados no banco em vez de na tela. */
router.get('/dashboard', async (req, res) => {
  const companyId = req.companyId;
  const inicioDoMes = new Date();
  inicioDoMes.setDate(1);
  inicioDoMes.setHours(0, 0, 0, 0);

  const ABERTAS = ['pending', 'in_progress', 'waiting_parts'];
  const CONCLUIDAS = ['completed', 'delivered'];

  const [abertas, concluidasNoMes, totalClientes, porStatus, recentes, faturamento] =
    await Promise.all([
      prisma.serviceOrder.count({ where: { company_id: companyId, status: { in: ABERTAS } } }),
      prisma.serviceOrder.count({
        where: {
          company_id: companyId,
          status: { in: CONCLUIDAS },
          completion_date: { gte: inicioDoMes },
        },
      }),
      prisma.client.count({ where: { company_id: companyId } }),
      prisma.serviceOrder.groupBy({
        by: ['status'],
        where: { company_id: companyId },
        _count: { _all: true },
      }),
      prisma.serviceOrder.findMany({
        where: { company_id: companyId },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      prisma.serviceOrder.aggregate({
        where: {
          company_id: companyId,
          status: { in: CONCLUIDAS },
          completion_date: { gte: inicioDoMes },
        },
        _sum: { total_amount_cents: true },
      }),
    ]);

  res.json({
    open_orders: abertas,
    completed_this_month: concluidasNoMes,
    revenue_this_month: paraReais(faturamento._sum.total_amount_cents ?? 0),
    total_clients: totalClientes,
    by_status: Object.fromEntries(porStatus.map((linha) => [linha.status, linha._count._all])),
    recent_orders: recentes.map((os) => ({
      id: os.id,
      order_number: os.order_number,
      client_name: os.client_name_snapshot,
      vehicle_info: `${os.vehicle_plate_snapshot} - ${os.vehicle_desc_snapshot}`,
      status: os.status,
      entry_date: os.entry_date,
      total_amount: paraReais(os.total_amount_cents),
    })),
  });
});

export default router;
