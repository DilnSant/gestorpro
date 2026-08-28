import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { criarOficina, derrubarServidor, prepararBanco, req, subirServidor, ITENS_EXEMPLO } from './apoio';

// O isolamento entre oficinas é a garantia central deste produto. Se algum destes
// testes falhar, os dados de um cliente estão visíveis para outro.

let alfa: Awaited<ReturnType<typeof criarOficina>>;
let beta: Awaited<ReturnType<typeof criarOficina>>;
let clienteAlfa: string;
let veiculoAlfa: string;
let orcamentoAlfa: string;

beforeAll(async () => {
  await prepararBanco();
  await subirServidor();

  alfa = await criarOficina('Oficina Alfa', 'alfa@teste.com');
  beta = await criarOficina('Oficina Beta', 'beta@teste.com');

  const cliente = await req('POST', '/api/clients', { name: 'Cliente Sigiloso' }, alfa.token);
  clienteAlfa = cliente.body.id;

  const veiculo = await req(
    'POST',
    '/api/vehicles',
    { client_id: clienteAlfa, plate: 'AAA1A11', brand: 'Ford', model: 'Ka' },
    alfa.token,
  );
  veiculoAlfa = veiculo.body.id;

  const orcamento = await req(
    'POST',
    '/api/quotes',
    { client_id: clienteAlfa, vehicle_id: veiculoAlfa, items: ITENS_EXEMPLO },
    alfa.token,
  );
  orcamentoAlfa = orcamento.body.id;
});

afterAll(derrubarServidor);

describe('leitura', () => {
  it('lista só os próprios clientes', async () => {
    const deAlfa = await req('GET', '/api/clients', undefined, alfa.token);
    const deBeta = await req('GET', '/api/clients', undefined, beta.token);

    expect(deAlfa.body).toHaveLength(1);
    expect(deBeta.body).toHaveLength(0);
  });

  it('lista só os próprios orçamentos', async () => {
    const deBeta = await req('GET', '/api/quotes', undefined, beta.token);
    expect(deBeta.body).toHaveLength(0);
  });

  it('responde 404 ao buscar documento de outra oficina pelo id', async () => {
    const r = await req('GET', `/api/quotes/${orcamentoAlfa}`, undefined, beta.token);
    expect(r.status).toBe(404);
  });
});

describe('escrita', () => {
  it('não deixa editar cliente de outra oficina', async () => {
    const r = await req('PUT', `/api/clients/${clienteAlfa}`, { name: 'INVADIDO' }, beta.token);
    expect(r.status).toBe(404);

    const conferindo = await req('GET', '/api/clients', undefined, alfa.token);
    expect(conferindo.body[0].name).toBe('Cliente Sigiloso');
  });

  it('não deixa excluir veículo de outra oficina', async () => {
    const r = await req('DELETE', `/api/vehicles/${veiculoAlfa}`, undefined, beta.token);
    expect(r.status).toBe(404);
  });

  it('ignora company_id enviado no corpo — o registro não muda de dono', async () => {
    await req('PUT', `/api/clients/${clienteAlfa}`, { company_id: beta.companyId }, alfa.token);

    const deBeta = await req('GET', '/api/clients', undefined, beta.token);
    expect(deBeta.body).toHaveLength(0);
  });

  it('não deixa criar documento apontando para cliente de outra oficina', async () => {
    // A foreign key aceitaria: o banco não sabe nada sobre tenant.
    const r = await req(
      'POST',
      '/api/quotes',
      { client_id: clienteAlfa, vehicle_id: veiculoAlfa, items: ITENS_EXEMPLO },
      beta.token,
    );
    expect(r.status).toBe(400);
  });
});

describe('numeração por oficina', () => {
  it('cada oficina tem a própria sequência começando em 0001', async () => {
    const cliente = await req('POST', '/api/clients', { name: 'Cliente Beta' }, beta.token);
    const veiculo = await req(
      'POST',
      '/api/vehicles',
      { client_id: cliente.body.id, plate: 'BBB2B22' },
      beta.token,
    );
    const orcamento = await req(
      'POST',
      '/api/quotes',
      { client_id: cliente.body.id, vehicle_id: veiculo.body.id, items: ITENS_EXEMPLO },
      beta.token,
    );

    // Alfa já tem o ORC-0001; Beta precisa ter o seu próprio.
    expect(orcamento.body.quote_number).toBe('ORC-0001');
  });

  it('permite a mesma placa em oficinas diferentes', async () => {
    // O mesmo carro pode ser atendido por duas oficinas, cada uma com seu cadastro.
    const cliente = await req('POST', '/api/clients', { name: 'Dono do Ka' }, beta.token);
    const r = await req(
      'POST',
      '/api/vehicles',
      { client_id: cliente.body.id, plate: 'AAA1A11' },
      beta.token,
    );
    expect(r.status).toBe(201);
  });

  it('recusa placa repetida dentro da mesma oficina', async () => {
    const r = await req(
      'POST',
      '/api/vehicles',
      { client_id: clienteAlfa, plate: 'aaa-1a11' },
      alfa.token,
    );
    expect(r.status).toBeGreaterThanOrEqual(400);
  });
});

describe('painel administrativo', () => {
  it('esconde o painel de quem não é admin', async () => {
    const r = await req('GET', '/api/company/admin/all', undefined, alfa.token);
    // 404 em vez de 403: nem confirma que a rota existe.
    expect(r.status).toBe(404);
  });

  it('exige token', async () => {
    const r = await req('GET', '/api/company/admin/all');
    expect(r.status).toBe(401);
  });

  it('não deixa um dono comum impersonar outra oficina', async () => {
    const r = await req('POST', '/api/auth/impersonate', { company_id: beta.companyId }, alfa.token);
    expect(r.status).toBe(404);
  });

  it('deixa o admin listar as oficinas e entrar em uma delas', async () => {
    const { prisma } = await import('../src/prisma');
    await prisma.user.update({ where: { id: alfa.userId }, data: { role: 'admin' } });

    const login = await req('POST', '/api/auth/login', {
      email: 'alfa@teste.com',
      password: 'senhaforte123',
    });
    const tokenAdmin = login.body.token;

    const painel = await req('GET', '/api/company/admin/all', undefined, tokenAdmin);
    expect(painel.status).toBe(200);
    expect(painel.body.length).toBeGreaterThanOrEqual(2);

    const entrando = await req(
      'POST',
      '/api/auth/impersonate',
      { company_id: beta.companyId },
      tokenAdmin,
    );
    expect(entrando.body.user.company_id).toBe(beta.companyId);

    const saindo = await req(
      'POST',
      '/api/auth/impersonate',
      { company_id: null },
      entrando.body.token,
    );
    expect(saindo.body.user.company_id).toBeNull();
  });
});
