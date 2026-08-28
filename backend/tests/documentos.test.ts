import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { criarOficina, derrubarServidor, prepararBanco, req, subirServidor, ITENS_EXEMPLO } from './apoio';

let oficina: Awaited<ReturnType<typeof criarOficina>>;
let clienteId: string;
let veiculoId: string;

beforeAll(async () => {
  await prepararBanco();
  await subirServidor();

  oficina = await criarOficina('Oficina Doc', 'doc@teste.com');

  const cliente = await req('POST', '/api/clients', { name: 'Maria Silva' }, oficina.token);
  clienteId = cliente.body.id;

  const veiculo = await req(
    'POST',
    '/api/vehicles',
    { client_id: clienteId, plate: 'abc-1d34', brand: 'Ford', model: 'Ka', year: 2015 },
    oficina.token,
  );
  veiculoId = veiculo.body.id;
});

afterAll(derrubarServidor);

const novoOrcamento = (extra: Record<string, unknown> = {}) =>
  req(
    'POST',
    '/api/quotes',
    { client_id: clienteId, vehicle_id: veiculoId, items: ITENS_EXEMPLO, ...extra },
    oficina.token,
  );

describe('dinheiro', () => {
  it('soma sem erro de ponto flutuante', async () => {
    // 120,50 + (3 × 33,33 = 99,99) − 10,10 = 210,39
    const r = await novoOrcamento({ discount: 10.1 });

    expect(r.body.labor_total).toBe(120.5);
    expect(r.body.parts_total).toBe(99.99);
    expect(r.body.total_amount).toBe(210.39);
  });

  it('guarda centavos inteiros no banco, não float', async () => {
    const { prisma } = await import('../src/prisma');
    const orcamento = await prisma.quote.findFirst({
      where: { company_id: oficina.companyId },
      orderBy: { createdAt: 'desc' },
      select: { total_amount_cents: true },
    });

    expect(orcamento?.total_amount_cents).toBe(21039);
    expect(Number.isInteger(orcamento?.total_amount_cents)).toBe(true);
  });

  it('ignora o total enviado pelo cliente e recalcula', async () => {
    const r = await novoOrcamento({ total_amount: 0, labor_total: 0 });
    expect(r.body.total_amount).toBeGreaterThan(0);
  });

  it('aceita preço com vírgula decimal', async () => {
    const r = await novoOrcamento({
      items: [{ type: 'part', description: 'Peça', quantity: 1, unit_price: '12,34' }],
    });
    expect(r.body.total_amount).toBe(12.34);
  });
});

describe('validação dos itens', () => {
  const casos: [string, unknown, string][] = [
    ['preço não numérico', [{ type: 'part', description: 'X', quantity: 1, unit_price: 'abc' }], 'preço'],
    ['item sem descrição', [{ type: 'part', quantity: 1, unit_price: 10 }], 'Descreva'],
    ['quantidade zero', [{ type: 'part', description: 'X', quantity: 0, unit_price: 10 }], 'quantidade'],
    ['tipo desconhecido', [{ type: 'outro', description: 'X', quantity: 1, unit_price: 10 }], 'peça ou serviço'],
    ['JSON corrompido', '{{{ não é json', 'inválido'],
  ];

  it.each(casos)('recusa %s com 400 e mensagem útil', async (_nome, items, trecho) => {
    const r = await novoOrcamento({ items });
    expect(r.status).toBe(400);
    expect(String(r.body.error).toLowerCase()).toContain(trecho.toLowerCase());
  });

  it('recusa desconto maior que o total', async () => {
    const r = await novoOrcamento({ discount: 9999 });
    expect(r.status).toBe(400);
  });
});

describe('itens relacionais', () => {
  it('grava cada item como uma linha, não como JSON em texto', async () => {
    const { prisma } = await import('../src/prisma');
    const orcamento = await novoOrcamento();

    const linhas = await prisma.quoteItem.findMany({
      where: { quote_id: orcamento.body.id },
      orderBy: { position: 'asc' },
    });

    expect(linhas).toHaveLength(2);
    expect(linhas[0]!.description).toBe('Troca de óleo');
    expect(linhas[0]!.unit_price_cents).toBe(12050);
  });

  it('substitui os itens ao editar, sem deixar órfãos', async () => {
    const { prisma } = await import('../src/prisma');
    const orcamento = await novoOrcamento();

    await req(
      'PUT',
      `/api/quotes/${orcamento.body.id}`,
      { items: [{ type: 'part', description: 'Só uma peça', quantity: 1, unit_price: 50 }] },
      oficina.token,
    );

    const linhas = await prisma.quoteItem.count({ where: { quote_id: orcamento.body.id } });
    expect(linhas).toBe(1);
  });

  it('apaga os itens junto com o documento', async () => {
    const { prisma } = await import('../src/prisma');
    const orcamento = await novoOrcamento();

    await req('DELETE', `/api/quotes/${orcamento.body.id}`, undefined, oficina.token);

    const linhas = await prisma.quoteItem.count({ where: { quote_id: orcamento.body.id } });
    expect(linhas).toBe(0);
  });
});

describe('snapshots', () => {
  it('congela o nome do cliente no momento da emissão', async () => {
    const orcamento = await novoOrcamento();
    expect(orcamento.body.client_name).toBe('Maria Silva');

    await req('PUT', `/api/clients/${clienteId}`, { name: 'Maria Silva Santos' }, oficina.token);

    const depois = await req('GET', `/api/quotes/${orcamento.body.id}`, undefined, oficina.token);
    // O documento emitido não muda quando o cadastro muda.
    expect(depois.body.client_name).toBe('Maria Silva');

    await req('PUT', `/api/clients/${clienteId}`, { name: 'Maria Silva' }, oficina.token);
  });
});

describe('conversão em ordem de serviço', () => {
  it('cria a OS com os itens e o vínculo de volta', async () => {
    const { prisma } = await import('../src/prisma');
    const orcamento = await novoOrcamento({ status: 'approved', discount: 10.1 });

    const os = await req('POST', `/api/quotes/${orcamento.body.id}/convert`, undefined, oficina.token);

    expect(os.status).toBe(201);
    expect(os.body.items).toHaveLength(2);
    expect(os.body.total_amount).toBe(210.39);

    const gravada = await prisma.serviceOrder.findUnique({
      where: { id: os.body.id },
      select: { from_quote_id: true },
    });
    expect(gravada?.from_quote_id).toBe(orcamento.body.id);

    const depois = await req('GET', `/api/quotes/${orcamento.body.id}`, undefined, oficina.token);
    expect(depois.body.status).toBe('converted');
  });

  it('recusa converter duas vezes', async () => {
    const orcamento = await novoOrcamento({ status: 'approved' });
    await req('POST', `/api/quotes/${orcamento.body.id}/convert`, undefined, oficina.token);

    const segunda = await req('POST', `/api/quotes/${orcamento.body.id}/convert`, undefined, oficina.token);
    expect(segunda.status).toBe(409);
  });

  it('recusa converter orçamento recusado', async () => {
    const orcamento = await novoOrcamento({ status: 'rejected' });
    const r = await req('POST', `/api/quotes/${orcamento.body.id}/convert`, undefined, oficina.token);
    expect(r.status).toBe(409);
  });

  it('bloqueia edição e exclusão depois de convertido', async () => {
    const orcamento = await novoOrcamento({ status: 'approved' });
    await req('POST', `/api/quotes/${orcamento.body.id}/convert`, undefined, oficina.token);

    const editando = await req('PUT', `/api/quotes/${orcamento.body.id}`, { discount: 5 }, oficina.token);
    expect(editando.status).toBe(409);

    const excluindo = await req('DELETE', `/api/quotes/${orcamento.body.id}`, undefined, oficina.token);
    expect(excluindo.status).toBe(409);
  });
});

describe('ordens de serviço', () => {
  it('gera números sequenciais sem repetir', async () => {
    for (let i = 0; i < 3; i++) {
      await req(
        'POST',
        '/api/service-orders',
        { client_id: clienteId, vehicle_id: veiculoId, items: ITENS_EXEMPLO },
        oficina.token,
      );
    }

    const lista = await req('GET', '/api/service-orders', undefined, oficina.token);
    const numeros = lista.body.map((os: { order_number: string }) => os.order_number);
    expect(new Set(numeros).size).toBe(numeros.length);
  });

  it('recusa situação fora da lista', async () => {
    const r = await req(
      'POST',
      '/api/service-orders',
      { client_id: clienteId, vehicle_id: veiculoId, items: ITENS_EXEMPLO, status: 'inventado' },
      oficina.token,
    );
    expect(r.status).toBe(400);
  });

  it('carimba a data ao concluir', async () => {
    const os = await req(
      'POST',
      '/api/service-orders',
      { client_id: clienteId, vehicle_id: veiculoId, items: ITENS_EXEMPLO },
      oficina.token,
    );

    const concluida = await req(
      'PUT',
      `/api/service-orders/${os.body.id}`,
      { status: 'completed' },
      oficina.token,
    );

    expect(concluida.body.completion_date).toBeTruthy();
  });
});

describe('painel', () => {
  it('calcula os números no banco', async () => {
    const r = await req('GET', '/api/company/dashboard', undefined, oficina.token);

    expect(r.status).toBe(200);
    expect(typeof r.body.open_orders).toBe('number');
    expect(typeof r.body.revenue_this_month).toBe('number');
    expect(r.body.total_clients).toBe(1);
    expect(Array.isArray(r.body.recent_orders)).toBe(true);
  });
});
