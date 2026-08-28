import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { BASE, criarOficina, derrubarServidor, prepararBanco, req, subirServidor } from './apoio';

// Achados médios da auditoria: entradas que deveriam virar 400/409 devolviam 500 —
// e cada 500 desses despejava os valores da requisição no log, junto com PII.

let oficina: Awaited<ReturnType<typeof criarOficina>>;
let clienteId: string;
let veiculoId: string;

beforeAll(async () => {
  await prepararBanco();
  await subirServidor();
  oficina = await criarOficina('Oficina Robusta', 'robusta@teste.com');

  const cliente = await req('POST', '/api/clients', { name: 'Cliente', cpf_cnpj: '111' }, oficina.token);
  clienteId = cliente.body.id;
  const veiculo = await req('POST', '/api/vehicles', { client_id: clienteId, plate: 'RBT1A11' }, oficina.token);
  veiculoId = veiculo.body.id;
});

afterAll(derrubarServidor);

describe('faixa numérica', () => {
  it('recusa ano absurdo com 400, não 500', async () => {
    const r = await req('PUT', `/api/vehicles/${veiculoId}`, { year: 1e30 }, oficina.token);
    expect(r.status).toBe(400);
  });

  it('recusa quilometragem absurda com 400', async () => {
    const r = await req('PUT', `/api/vehicles/${veiculoId}`, { km: 1e30 }, oficina.token);
    expect(r.status).toBe(400);
  });

  it('recusa preço de item fora da faixa com 400', async () => {
    const r = await req(
      'POST',
      '/api/quotes',
      {
        client_id: clienteId,
        vehicle_id: veiculoId,
        items: [{ type: 'part', description: 'X', quantity: 1, unit_price: 1e30 }],
      },
      oficina.token,
    );
    expect(r.status).toBe(400);
  });

  it('recusa quantidade absurda com 400', async () => {
    const r = await req(
      'POST',
      '/api/quotes',
      {
        client_id: clienteId,
        vehicle_id: veiculoId,
        items: [{ type: 'part', description: 'X', quantity: 1e12, unit_price: 10 }],
      },
      oficina.token,
    );
    expect(r.status).toBe(400);
  });
});

describe('unicidade', () => {
  it('responde 409 no PUT com CPF duplicado, como já fazia o POST', async () => {
    const outro = await req('POST', '/api/clients', { name: 'Outro', cpf_cnpj: '222' }, oficina.token);

    // Antes: POST devolvia 400 e PUT devolvia 500 para a mesma violação.
    const r = await req('PUT', `/api/clients/${outro.body.id}`, { cpf_cnpj: '111' }, oficina.token);
    expect(r.status).toBe(409);
    expect(String(r.body.error)).toMatch(/CPF|CNPJ/i);
  });
});

describe('corpo malformado', () => {
  it('responde 400 para JSON quebrado, não 500', async () => {
    const resposta = await fetch(`${BASE}/api/clients`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${oficina.token}`,
      },
      body: '{ isto não é json',
    });
    expect(resposta.status).toBe(400);
  });
});

describe('cabeçalhos de segurança', () => {
  it('não anuncia o servidor e traz nosniff', async () => {
    const resposta = await fetch(`${BASE}/health`);
    expect(resposta.headers.get('x-powered-by')).toBeNull();
    expect(resposta.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

describe('CORS', () => {
  it('não libera origem desconhecida', async () => {
    const resposta = await fetch(`${BASE}/health`, {
      headers: { Origin: 'https://site-malicioso.example' },
    });
    expect(resposta.headers.get('access-control-allow-origin')).toBeNull();
  });
});
