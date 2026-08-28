import { Router } from 'express';
import { prisma } from '../prisma';
import { requireCompanyId } from '../middleware/authMiddleware';

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
    else if (typeof valor === 'string') dados[campo] = valor.trim();
  }

  // A cor vai direto para uma CSS custom property no frontend. Sem esta validação,
  // qualquer string entraria numa folha de estilo.
  if (dados.primary_color && !/^#[0-9a-fA-F]{6}$/.test(dados.primary_color)) {
    return { __erro: 'A cor deve estar no formato #RRGGBB.' };
  }

  return dados;
}

// ---------------------------------------------------------------------------
// Painel administrativo
//
// ATENÇÃO (BACKLOG 08): esta rota deveria ser exclusiva de quem tem role admin,
// mas o papel do usuário ainda não é verificável no servidor — não há token. Ela
// fica aberta enquanto a autenticação for simulada. É o motivo pelo qual não pode
// ir a produção nesse estado.
// ---------------------------------------------------------------------------
router.get('/admin/all', async (_req, res) => {
  const companies = await prisma.company.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { clients: true, vehicles: true, serviceOrders: true, quotes: true } },
    },
  });

  res.json(
    companies.map((empresa) => ({
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

// A partir daqui tudo é escopado à empresa da requisição.
router.use(requireCompanyId);

router.get('/', async (req, res) => {
  const company = await prisma.company.findUnique({ where: { id: req.companyId } });
  if (!company) return res.status(404).json({ error: 'Empresa não encontrada.' });
  res.json(company);
});

router.put('/', async (req, res) => {
  const dados = extrairCampos(req.body);
  if ('__erro' in dados) return res.status(400).json({ error: dados.__erro });

  if (dados.name !== undefined && !dados.name) {
    return res.status(400).json({ error: 'O nome da empresa não pode ficar em branco.' });
  }

  // updateMany garante que a empresa alterada é a da requisição.
  const { count } = await prisma.company.updateMany({
    where: { id: req.companyId },
    data: dados,
  });
  if (count === 0) return res.status(404).json({ error: 'Empresa não encontrada.' });

  const company = await prisma.company.findUnique({ where: { id: req.companyId } });
  res.json(company);
});

/** Números do painel inicial, calculados no banco em vez de na tela. */
router.get('/dashboard', async (req, res) => {
  const companyId = req.companyId;
  const inicioDoMes = new Date();
  inicioDoMes.setDate(1);
  inicioDoMes.setHours(0, 0, 0, 0);

  const ABERTAS = ['pending', 'in_progress', 'waiting_parts'];

  const [abertas, concluidasNoMes, totalClientes, porStatus, recentes, faturamento] =
    await Promise.all([
      prisma.serviceOrder.count({ where: { company_id: companyId, status: { in: ABERTAS } } }),
      prisma.serviceOrder.count({
        where: {
          company_id: companyId,
          status: { in: ['completed', 'delivered'] },
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
          status: { in: ['completed', 'delivered'] },
          completion_date: { gte: inicioDoMes },
        },
        _sum: { total_amount: true },
      }),
    ]);

  res.json({
    open_orders: abertas,
    completed_this_month: concluidasNoMes,
    revenue_this_month: faturamento._sum.total_amount ?? 0,
    total_clients: totalClientes,
    by_status: Object.fromEntries(porStatus.map((linha) => [linha.status, linha._count._all])),
    recent_orders: recentes,
  });
});

export default router;
