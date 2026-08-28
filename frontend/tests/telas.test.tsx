import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StatusBadge, { rotuloStatus } from '../src/components/StatusBadge';
import EmptyState from '../src/components/EmptyState';
import PageHeader from '../src/components/PageHeader';
import Login from '../src/pages/Login';
import Clients from '../src/pages/Clients';
import { CompanyProvider } from '../src/context/CompanyContext';
import { guardarToken } from '../src/lib/api';

const respostaFalsa = (status: number, corpo: unknown) =>
  new Response(corpo === null ? null : JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function montar(tela: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CompanyProvider>
        <MemoryRouter>{tela}</MemoryRouter>
      </CompanyProvider>
    </QueryClientProvider>,
  );
}

describe('StatusBadge', () => {
  it.each([
    ['pending', 'Pendente'],
    ['in_progress', 'Em andamento'],
    ['waiting_parts', 'Aguardando peças'],
    ['converted', 'Convertido em OS'],
    ['rejected', 'Recusado'],
  ])('traduz %s para "%s"', (status, rotulo) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(rotulo)).toBeInTheDocument();
  });

  it('marca o status no atributo, que é o que a cor usa', () => {
    render(<StatusBadge status="completed" />);
    expect(screen.getByText('Concluída')).toHaveAttribute('data-status', 'completed');
  });

  it('não quebra com status desconhecido: mostra o valor cru', () => {
    render(<StatusBadge status="status_novo_do_futuro" />);
    expect(screen.getByText('status_novo_do_futuro')).toBeInTheDocument();
    expect(rotuloStatus('outro')).toBe('outro');
  });
});

describe('EmptyState', () => {
  it('diz o que fazer, não só que está vazio', () => {
    render(
      <EmptyState
        icon={<span />}
        title="Nenhuma ordem ainda"
        description="Crie a primeira pelo botão Nova OS."
        action={<button>Nova OS</button>}
      />,
    );

    expect(screen.getByText('Nenhuma ordem ainda')).toBeInTheDocument();
    expect(screen.getByText(/crie a primeira/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nova OS' })).toBeInTheDocument();
  });
});

describe('PageHeader', () => {
  it('usa um h1, para a página ter um título de verdade', () => {
    render(<PageHeader title="Clientes" subtitle="3 cadastrados" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Clientes' })).toBeInTheDocument();
    expect(screen.getByText('3 cadastrados')).toBeInTheDocument();
  });
});

describe('Login', () => {
  it('mostra a mensagem do servidor quando as credenciais estão erradas', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(respostaFalsa(401, { error: 'E-mail ou senha incorretos.' })),
    );

    montar(<Login />);

    await userEvent.type(screen.getByLabelText('E-mail'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'senhaerrada');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    // Antes o erro só ia para o console e a tela ficava parada.
    expect(await screen.findByText('E-mail ou senha incorretos.')).toBeInTheDocument();
  });

  it('alterna para o cadastro e passa a pedir o nome', async () => {
    montar(<Login />);

    expect(screen.queryByLabelText('Seu nome')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Criar agora' }));

    expect(screen.getByLabelText('Seu nome')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar conta' })).toBeInTheDocument();
  });

  it('exige senha de 8 caracteres no cadastro', async () => {
    montar(<Login />);
    await userEvent.click(screen.getByRole('button', { name: 'Criar agora' }));

    expect(screen.getByLabelText('Senha')).toHaveAttribute('minLength', '8');
  });

  it('avisa quando o servidor está fora do ar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    montar(<Login />);
    await userEvent.type(screen.getByLabelText('E-mail'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'senhaforte123');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText(/conexão/i)).toBeInTheDocument();
  });
});

describe('Clientes', () => {
  it('mostra o estado vazio com convite para cadastrar o primeiro', async () => {
    guardarToken('token');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) =>
        Promise.resolve(respostaFalsa(200, url.includes('/api/auth/me') ? { id: 'u1' } : [])),
      ),
    );

    montar(<Clients />);

    expect(await screen.findByText('Nenhum cliente ainda')).toBeInTheDocument();
    expect(screen.getByText(/cadastre o primeiro cliente/i)).toBeInTheDocument();
  });

  it('lista os clientes e filtra pela busca', async () => {
    guardarToken('token');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) =>
        Promise.resolve(
          respostaFalsa(
            200,
            url.includes('/api/auth/me')
              ? { id: 'u1' }
              : [
                  { id: '1', name: 'Maria Silva', cpf_cnpj: null, phone: '119', email: null, address: null, notes: null },
                  { id: '2', name: 'João Souza', cpf_cnpj: null, phone: null, email: null, address: null, notes: null },
                ],
          ),
        ),
      ),
    );

    montar(<Clients />);

    expect(await screen.findByText('Maria Silva')).toBeInTheDocument();
    expect(screen.getByText('João Souza')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Buscar clientes'), 'maria');

    await waitFor(() => expect(screen.queryByText('João Souza')).not.toBeInTheDocument());
    expect(screen.getByText('Maria Silva')).toBeInTheDocument();
  });

  it('mostra o erro do servidor ao salvar em vez de fechar o formulário em silêncio', async () => {
    guardarToken('token');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return Promise.resolve(respostaFalsa(400, { error: 'Já existe um cliente com esse CPF.' }));
        }
        return Promise.resolve(respostaFalsa(200, url.includes('/api/auth/me') ? { id: 'u1' } : []));
      }),
    );

    montar(<Clients />);

    await userEvent.click(await screen.findByRole('button', { name: /novo cliente/i }));
    await userEvent.type(screen.getByLabelText('Nome *'), 'Maria');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Já existe um cliente com esse CPF.')).toBeInTheDocument();
    // O formulário continua aberto para a pessoa corrigir.
    expect(screen.getByLabelText('Nome *')).toBeInTheDocument();
  });
});
