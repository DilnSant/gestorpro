import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Notes from '../src/pages/Notes';
import { CompanyProvider } from '../src/context/CompanyContext';
import { guardarToken } from '../src/lib/api';

const CLIENTES = [
  { id: 'cli-1', name: 'Maria Silva' },
  { id: 'cli-2', name: 'João Souza' },
];

const VEICULOS = [{ id: 'vei-1', plate: 'ABC1D34', brand: 'Ford', model: 'Ka' }];

const ORDENS = [{ id: 'os-1', order_number: 'OS-0001', client_name: 'Maria Silva' }];

function servidorFalso(aoSalvar?: (corpo: unknown) => void) {
  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const responder = (corpo: unknown, status = 200) =>
      Promise.resolve(
        new Response(JSON.stringify(corpo), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    if (init?.method === 'POST' && url.includes('/api/notes')) {
      aoSalvar?.(JSON.parse(init.body as string));
      return responder({ id: 'nota-1' }, 201);
    }
    if (url.includes('/api/auth/me')) return responder({ id: 'u1' });
    if (url.includes('/api/clients')) return responder(CLIENTES);
    if (url.includes('/api/vehicles')) return responder(VEICULOS);
    if (url.includes('/api/service-orders')) return responder(ORDENS);
    return responder([]);
  });
}

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

const abrirFormulario = async () => {
  await userEvent.click(await screen.findByRole('button', { name: /nova nota/i }));
};

describe('vínculo da nota', () => {
  it('começa desabilitado, porque nota geral não se vincula a nada', async () => {
    guardarToken('token');
    vi.stubGlobal('fetch', servidorFalso());

    montar(<Notes />);
    await abrirFormulario();

    const seletor = screen.getByLabelText('Vínculo');
    expect(seletor).toBeDisabled();
    expect(screen.getByText('Nota geral, sem vínculo')).toBeInTheDocument();
  });

  it('oferece os clientes pelo nome, não pelo ID', async () => {
    // Antes isto era um campo de texto pedindo um UUID de 36 caracteres.
    guardarToken('token');
    vi.stubGlobal('fetch', servidorFalso());

    montar(<Notes />);
    await abrirFormulario();
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'client');

    const seletor = await screen.findByLabelText('Cliente vinculado');
    expect(seletor).toBeEnabled();
    await waitFor(() => expect(screen.getByRole('option', { name: 'Maria Silva' })).toBeInTheDocument());
    expect(screen.getByRole('option', { name: 'João Souza' })).toBeInTheDocument();
  });

  it('mostra a placa e o modelo do veículo', async () => {
    guardarToken('token');
    vi.stubGlobal('fetch', servidorFalso());

    montar(<Notes />);
    await abrirFormulario();
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'vehicle');

    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'ABC1D34 — Ford Ka' })).toBeInTheDocument(),
    );
  });

  it('mostra o número da OS com o cliente', async () => {
    guardarToken('token');
    vi.stubGlobal('fetch', servidorFalso());

    montar(<Notes />);
    await abrirFormulario();
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'service_order');

    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'OS-0001 — Maria Silva' })).toBeInTheDocument(),
    );
  });

  it('limpa o vínculo ao trocar de tipo — uma OS não é um cliente', async () => {
    guardarToken('token');
    const salvos: unknown[] = [];
    vi.stubGlobal('fetch', servidorFalso((corpo) => salvos.push(corpo)));

    montar(<Notes />);
    await abrirFormulario();

    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'client');
    await waitFor(() => expect(screen.getByRole('option', { name: 'Maria Silva' })).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText('Cliente vinculado'), 'cli-1');

    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'vehicle');

    await userEvent.type(screen.getByLabelText('Título *'), 'Laudo');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(salvos).toHaveLength(1));
    expect(salvos[0]).toMatchObject({ type: 'vehicle', related_id: null });
  });

  it('envia related_id nulo quando o tipo é geral', async () => {
    guardarToken('token');
    const salvos: unknown[] = [];
    vi.stubGlobal('fetch', servidorFalso((corpo) => salvos.push(corpo)));

    montar(<Notes />);
    await abrirFormulario();
    await userEvent.type(screen.getByLabelText('Título *'), 'Recado');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(salvos).toHaveLength(1));
    expect(salvos[0]).toMatchObject({ type: 'general', related_id: null });
  });

  it('salva o vínculo escolhido', async () => {
    guardarToken('token');
    const salvos: unknown[] = [];
    vi.stubGlobal('fetch', servidorFalso((corpo) => salvos.push(corpo)));

    montar(<Notes />);
    await abrirFormulario();
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'client');
    await waitFor(() => expect(screen.getByRole('option', { name: 'João Souza' })).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText('Cliente vinculado'), 'cli-2');

    await userEvent.type(screen.getByLabelText('Título *'), 'Combinado');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(salvos).toHaveLength(1));
    expect(salvos[0]).toMatchObject({ type: 'client', related_id: 'cli-2' });
  });
});
