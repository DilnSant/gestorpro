import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { criarOficina, derrubarServidor, prepararBanco, req, subirServidor } from './apoio';

beforeAll(async () => {
  await prepararBanco();
  await subirServidor();
});

afterAll(derrubarServidor);

describe('cadastro', () => {
  it('recusa senha com menos de 8 caracteres', async () => {
    const r = await req('POST', '/api/auth/register', {
      name: 'Curta',
      email: 'curta@teste.com',
      password: '123',
    });
    expect(r.status).toBe(400);
  });

  it('cria a conta, devolve token e nunca expõe a senha', async () => {
    const r = await req('POST', '/api/auth/register', {
      name: 'Dono',
      email: '  DONO@Teste.com ',
      password: 'senhaforte123',
    });

    expect(r.status).toBe(200);
    expect(r.body.token).toBeTruthy();
    expect(r.body.user).not.toHaveProperty('password');
    expect(r.body.user.email).toBe('dono@teste.com');
    expect(r.body.user.role).toBe('owner');
  });

  it('grava a senha como hash argon2id, nunca em texto puro', async () => {
    const { prisma } = await import('../src/prisma');
    const usuario = await prisma.user.findUnique({
      where: { email: 'dono@teste.com' },
      select: { password: true },
    });

    expect(usuario?.password).toMatch(/^\$argon2id\$/);
    expect(usuario?.password).not.toContain('senhaforte123');
  });

  it('ignora "role: admin" enviado no corpo — ninguém se promove', async () => {
    const r = await req('POST', '/api/auth/register', {
      name: 'Esperto',
      email: 'esperto@teste.com',
      password: 'senhaforte123',
      role: 'admin',
    });

    expect(r.body.user.role).toBe('owner');
  });

  it('não revela, no cadastro, que o e-mail já tem conta', async () => {
    const existente = await req('POST', '/api/auth/register', {
      name: 'Outro',
      email: 'dono@teste.com',
      password: 'senhaforte123',
    });

    // Antes: 409 para existente e 200 para novo — um oráculo que enumera quem
    // tem conta no sistema, sem autenticação nenhuma.
    expect(existente.status).toBe(202);
    expect(existente.body).not.toHaveProperty('token');
    expect(JSON.stringify(existente.body)).not.toMatch(/já existe/i);
  });
});

describe('login', () => {
  it('recusa senha errada', async () => {
    const r = await req('POST', '/api/auth/login', {
      email: 'dono@teste.com',
      password: 'senhaerrada',
    });
    expect(r.status).toBe(401);
  });

  it('responde igual para e-mail inexistente e senha errada', async () => {
    // Mensagens diferentes revelariam quem tem conta no sistema.
    const errada = await req('POST', '/api/auth/login', {
      email: 'dono@teste.com',
      password: 'outraerrada',
    });
    const inexistente = await req('POST', '/api/auth/login', {
      email: 'ninguem@teste.com',
      password: 'qualquer',
    });

    expect(inexistente.status).toBe(errada.status);
    expect(inexistente.body.error).toBe(errada.body.error);
  });

  it('aceita a senha correta e devolve token', async () => {
    const r = await req('POST', '/api/auth/login', {
      email: 'dono@teste.com',
      password: 'senhaforte123',
    });
    expect(r.status).toBe(200);
    expect(r.body.token).toBeTruthy();
  });

  it('bloqueia a conta após cinco tentativas erradas, sem revelar que bloqueou', async () => {
    const { prisma } = await import('../src/prisma');
    await req('POST', '/api/auth/register', {
      name: 'Alvo',
      email: 'alvo@teste.com',
      password: 'senhaforte123',
    });

    for (let i = 0; i < 5; i++) {
      await req('POST', '/api/auth/login', { email: 'alvo@teste.com', password: 'errada' });
    }

    // Mesmo com a senha certa: o bloqueio é por tentativas, não por senha.
    const bloqueado = await req('POST', '/api/auth/login', {
      email: 'alvo@teste.com',
      password: 'senhaforte123',
    });

    // A resposta é idêntica à de credencial errada. Dizer "conta bloqueada"
    // confirmaria que a conta existe.
    const inexistente = await req('POST', '/api/auth/login', {
      email: 'ninguem-mesmo@teste.com',
      password: 'qualquer',
    });
    expect(bloqueado.status).toBe(inexistente.status);
    expect(bloqueado.body.error).toBe(inexistente.body.error);

    const registro = await prisma.user.findUnique({ where: { email: 'alvo@teste.com' } });
    expect(registro?.locked_until).not.toBeNull();
  });

  it('libera a conta quando o bloqueio expira, sem contador acumulado', async () => {
    const { prisma } = await import('../src/prisma');
    await req('POST', '/api/auth/register', {
      name: 'Preso',
      email: 'preso@teste.com',
      password: 'senhaforte123',
    });

    for (let i = 0; i < 5; i++) {
      await req('POST', '/api/auth/login', { email: 'preso@teste.com', password: 'errada' });
    }

    // Passa o tempo do bloqueio.
    await prisma.user.update({
      where: { email: 'preso@teste.com' },
      data: { locked_until: new Date(Date.now() - 60_000) },
    });

    // Antes, o contador continuava em 5: UMA senha errada rebloqueava, e o
    // atacante mantinha a conta fora do ar para sempre com uma requisição a cada
    // 15 min. Agora o contador zera quando o bloqueio expira.
    await req('POST', '/api/auth/login', { email: 'preso@teste.com', password: 'errada' });

    const r = await req('POST', '/api/auth/login', {
      email: 'preso@teste.com',
      password: 'senhaforte123',
    });
    expect(r.status).toBe(200);
  });
});

describe('proteção das rotas', () => {
  it('recusa requisição sem token', async () => {
    const r = await req('GET', '/api/clients');
    expect(r.status).toBe(401);
  });

  it('recusa token forjado', async () => {
    const r = await req('GET', '/api/clients', undefined, 'nao.e.um.token');
    expect(r.status).toBe(401);
  });

  it('recusa token válido sem oficina, sem vazar dados', async () => {
    const cadastro = await req('POST', '/api/auth/register', {
      name: 'Sem oficina',
      email: 'semoficina@teste.com',
      password: 'senhaforte123',
    });

    const r = await req('GET', '/api/clients', undefined, cadastro.body.token);
    expect(r.status).toBe(403);
    expect(Array.isArray(r.body)).toBe(false);
  });
});

describe('cadastro da oficina', () => {
  it('cria a oficina e reemite o token com o company_id', async () => {
    const cadastro = await req('POST', '/api/auth/register', {
      name: 'Novo',
      email: 'novo@teste.com',
      password: 'senhaforte123',
    });

    const r = await req('POST', '/api/auth/setup-company', { name: 'Oficina Nova' }, cadastro.body.token);

    expect(r.body.user.company_id).toBeTruthy();
    expect(r.body.token).not.toBe(cadastro.body.token);
  });

  it('recusa segunda oficina para a mesma conta', async () => {
    const oficina = await criarOficina('Oficina Única', 'unica@teste.com');
    const r = await req('POST', '/api/auth/setup-company', { name: 'Segunda' }, oficina.token);
    expect(r.status).toBe(409);
  });

  it('não deixa empresa órfã quando o vínculo falha', async () => {
    const { prisma } = await import('../src/prisma');
    const antes = await prisma.company.count();

    // Token válido de um usuário que já não existe: a empresa chega a ser criada
    // dentro da transação e precisa sumir junto com o erro.
    const cadastro = await req('POST', '/api/auth/register', {
      name: 'Fantasma',
      email: 'fantasma@teste.com',
      password: 'senhaforte123',
    });
    await prisma.user.delete({ where: { email: 'fantasma@teste.com' } });

    const r = await req('POST', '/api/auth/setup-company', { name: 'Oficina Fantasma' }, cadastro.body.token);

    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(await prisma.company.count()).toBe(antes);
  });
});

describe('troca de senha', () => {
  it('exige a senha atual correta', async () => {
    const oficina = await criarOficina('Oficina Senha', 'senha@teste.com');
    const r = await req(
      'POST',
      '/api/auth/change-password',
      { current_password: 'errada', new_password: 'novasenha123' },
      oficina.token,
    );
    expect(r.status).toBe(401);
  });

  it('troca a senha e a nova passa a valer', async () => {
    const oficina = await criarOficina('Oficina Troca', 'troca@teste.com');

    const troca = await req(
      'POST',
      '/api/auth/change-password',
      { current_password: 'senhaforte123', new_password: 'senhanova456' },
      oficina.token,
    );
    expect(troca.status).toBe(200);

    const antiga = await req('POST', '/api/auth/login', {
      email: 'troca@teste.com',
      password: 'senhaforte123',
    });
    expect(antiga.status).toBe(401);

    const nova = await req('POST', '/api/auth/login', {
      email: 'troca@teste.com',
      password: 'senhanova456',
    });
    expect(nova.status).toBe(200);
  });
});

describe('revogação de sessão', () => {
  it('invalida os tokens antigos ao trocar a senha', async () => {
    const oficina = await criarOficina('Oficina Revoga', 'revoga@teste.com');

    // O token funciona antes.
    expect((await req('GET', '/api/clients', undefined, oficina.token)).status).toBe(200);

    // Um segundo de folga: a comparação é por `iat`, em segundos.
    await new Promise((r) => setTimeout(r, 1100));
    const troca = await req(
      'POST',
      '/api/auth/change-password',
      { current_password: 'senhaforte123', new_password: 'senhanova456' },
      oficina.token,
    );
    expect(troca.status).toBe(200);

    // Antes, o token anterior continuava válido por até 12h — justamente a ação
    // que a vítima toma acreditando ter expulsado o invasor.
    const depois = await req('GET', '/api/clients', undefined, oficina.token);
    expect(depois.status).toBe(401);
  });

  it('invalida o token de impersonação ao voltar ao painel', async () => {
    const { prisma } = await import('../src/prisma');
    const admin = await criarOficina('Oficina Admin', 'admin-revoga@teste.com');
    const alvo = await criarOficina('Oficina Alvo', 'alvo-revoga@teste.com');

    await prisma.user.update({ where: { id: admin.userId }, data: { role: 'admin' } });
    const login = await req('POST', '/api/auth/login', {
      email: 'admin-revoga@teste.com',
      password: 'senhaforte123',
    });

    const entrando = await req(
      'POST',
      '/api/auth/impersonate',
      { company_id: alvo.companyId },
      login.body.token,
    );
    const tokenImpersonado = entrando.body.token;

    expect((await req('GET', '/api/clients', undefined, tokenImpersonado)).status).toBe(200);

    await req('POST', '/api/auth/impersonate', { company_id: null }, tokenImpersonado);

    // O token da impersonação precisa morrer junto. Comparar só o `iat` não
    // separaria os dois: a troca acontece no mesmo segundo.
    const depois = await req('GET', '/api/clients', undefined, tokenImpersonado);
    expect(depois.status).toBe(401);
  });

  it('invalida o token de um usuário que deixou de existir', async () => {
    const { prisma } = await import('../src/prisma');
    const oficina = await criarOficina('Oficina Sumida', 'sumida@teste.com');

    await prisma.user.delete({ where: { id: oficina.userId } });

    const depois = await req('GET', '/api/clients', undefined, oficina.token);
    expect(depois.status).toBe(401);
  });
});
