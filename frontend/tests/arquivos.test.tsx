import { execSync } from 'node:child_process';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CompanySettings from '../src/pages/CompanySettings';
import Notes from '../src/pages/Notes';
import { CompanyProvider } from '../src/context/CompanyContext';
import { guardarToken } from '../src/lib/api';

// Os dois pontos em que o browser busca o arquivo sozinho, sem poder mandar
// header: `<img src>` da logo e `<a href>` do anexo. Antes não havia teste nenhum
// aqui — se quebrassem, a suíte continuava verde e o usuário via imagem quebrada.

const EMPRESA = {
  id: 'emp-1',
  name: 'Oficina Teste',
  logo_url: '/api/files/abc',
  logo_view_url: '/api/files/abc?t=assinatura123',
  primary_color: '#2563EB',
  phone: null,
  email: null,
  address: null,
  cnpj: null,
};

const json = (corpo: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(corpo), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );

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

describe('logo da empresa', () => {
  it('renderiza a URL assinada, que é a que o <img> consegue buscar', async () => {
    guardarToken('token');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) =>
        json(url.includes('/api/auth/me') ? { id: 'u1' } : EMPRESA),
      ),
    );

    montar(<CompanySettings />);

    const img = await screen.findByAltText('Logo da empresa');
    expect(img.getAttribute('src')).toContain('/api/files/abc?t=assinatura123');
    // O caminho antigo era servido sem autenticação nenhuma.
    expect(img.getAttribute('src')).not.toContain('/uploads/');
  });

  it('persiste a REFERÊNCIA, nunca a URL assinada', async () => {
    // O erro mais fácil de cometer aqui: gravar no banco um link que expira em
    // uma hora, e a logo sumir sozinha depois.
    guardarToken('token');
    const enviados: unknown[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (init?.method === 'PUT') {
          enviados.push(JSON.parse(init.body as string));
          return json(EMPRESA);
        }
        return json(url.includes('/api/auth/me') ? { id: 'u1' } : EMPRESA);
      }),
    );

    montar(<CompanySettings />);
    await screen.findByAltText('Logo da empresa');
    await userEvent.click(screen.getByRole('button', { name: /salvar alterações/i }));

    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(enviados[0]).toMatchObject({ logo_url: '/api/files/abc' });
    expect(JSON.stringify(enviados[0])).not.toContain('?t=');
  });

  it('usa a view_url devolvida pelo upload para o preview imediato', async () => {
    guardarToken('token');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes('/api/upload')) {
          return json({
            files: [
              {
                id: 'novo',
                url: '/api/files/novo',
                view_url: '/api/files/novo?t=nova',
                name: 'logo.png',
                size: 10,
                mime: 'image/png',
              },
            ],
          });
        }
        return json(url.includes('/api/auth/me') ? { id: 'u1' } : { ...EMPRESA, logo_url: null, logo_view_url: null });
      }),
    );

    montar(<CompanySettings />);

    const campo = await screen.findByLabelText('Logo');
    await userEvent.upload(campo, new File(['x'], 'logo.png', { type: 'image/png' }));

    const img = await screen.findByAltText('Logo da empresa');
    expect(img.getAttribute('src')).toContain('/api/files/novo?t=nova');
  });
});

describe('anexos de nota', () => {
  const NOTA = {
    id: 'nota-1',
    title: 'Laudo',
    content: null,
    type: 'general',
    related_id: null,
    createdAt: '2026-08-28T10:00:00.000Z',
    files: [
      {
        id: 'arq-1',
        url: '/api/files/arq-1',
        view_url: '/api/files/arq-1?t=assinado',
        name: 'laudo.pdf',
        size: 100,
        mime: 'application/pdf',
      },
    ],
  };

  it('aponta o link para a URL assinada e mostra o nome do arquivo', async () => {
    guardarToken('token');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) =>
        json(url.includes('/api/auth/me') ? { id: 'u1' } : url.includes('/api/notes') ? [NOTA] : []),
      ),
    );

    montar(<Notes />);

    const link = await screen.findByRole('link', { name: /laudo\.pdf/i });
    expect(link.getAttribute('href')).toContain('/api/files/arq-1?t=assinado');
    expect(link.getAttribute('href')).not.toContain('/uploads/');
    // rel=noreferrer limita o vazamento da assinatura pelo header Referer.
    expect(link.getAttribute('rel')).toContain('noreferrer');
  });

  it('envia a referência estável ao salvar, não a assinada', async () => {
    guardarToken('token');
    const enviados: unknown[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (init?.method === 'PUT' && url.includes('/api/notes/')) {
          enviados.push(JSON.parse(init.body as string));
          return json(NOTA);
        }
        return json(url.includes('/api/auth/me') ? { id: 'u1' } : url.includes('/api/notes') ? [NOTA] : []);
      }),
    );

    montar(<Notes />);

    await userEvent.click(await screen.findByRole('button', { name: /editar nota laudo/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(enviados[0]).toMatchObject({ file_urls: ['/api/files/arq-1'] });
    expect(JSON.stringify(enviados[0])).not.toContain('?t=');
  });
});

describe('guarda contra regressão', () => {
  it('nenhum arquivo do frontend referencia mais o caminho público /uploads/', () => {
    // Guarda barata: se alguém reintroduzir o caminho antigo, o teste acusa antes
    // de virar imagem quebrada em produção.
    const saida = execSync(
      "grep -rn \"'/uploads/\\|\\\"/uploads/\\|(/uploads/\" src/ || true",
      { cwd: process.cwd(), encoding: 'utf8' },
    ).trim();
    expect(saida).toBe('');
  });
});
