import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  api,
  descartarToken,
  formatarData,
  formatarMoeda,
  guardarToken,
  lerItens,
  lerToken,
  registrarExpiracaoDeSessao,
} from '../src/lib/api';

const respostaFalsa = (status: number, corpo: unknown) =>
  new Response(corpo === null ? '' : JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('token', () => {
  it('guarda, lê e descarta', () => {
    expect(lerToken()).toBeNull();
    guardarToken('abc123');
    expect(lerToken()).toBe('abc123');
    descartarToken();
    expect(lerToken()).toBeNull();
  });

  it('envia o token no header Authorization', async () => {
    guardarToken('meu-token');
    const fetchFalso = vi.fn().mockResolvedValue(respostaFalsa(200, []));
    vi.stubGlobal('fetch', fetchFalso);

    await api.get('/api/clients');

    const headers = fetchFalso.mock.calls[0]![1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer meu-token');
  });

  it('não envia Authorization quando não há token', async () => {
    const fetchFalso = vi.fn().mockResolvedValue(respostaFalsa(200, []));
    vi.stubGlobal('fetch', fetchFalso);

    await api.get('/api/clients');

    const headers = fetchFalso.mock.calls[0]![1].headers as Headers;
    expect(headers.get('Authorization')).toBeNull();
  });
});

describe('tratamento de erro', () => {
  it('repassa a mensagem do servidor em vez de uma genérica', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(respostaFalsa(400, { error: 'A placa é obrigatória.' })),
    );

    await expect(api.post('/api/vehicles', {})).rejects.toThrow('A placa é obrigatória.');
  });

  it('expõe o status HTTP no erro', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respostaFalsa(404, { error: 'Não encontrado.' })));

    await expect(api.get('/api/quotes/x')).rejects.toMatchObject({
      status: 404,
      name: 'ApiError',
    });
  });

  it('explica a falha de rede em vez de vazar o erro do fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(api.get('/api/clients')).rejects.toThrow(/conexão/i);
  });

  it('trata 204 sem corpo sem quebrar no JSON.parse', async () => {
    // 204 é "null body status": o construtor recusa corpo, nem string vazia.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(api.delete('/api/clients/x')).resolves.toBeUndefined();
  });
});

describe('expiração de sessão', () => {
  beforeEach(() => registrarExpiracaoDeSessao(() => {}));

  it('descarta o token e avisa o app quando o servidor responde 401', async () => {
    guardarToken('token-vencido');
    const aoExpirar = vi.fn();
    registrarExpiracaoDeSessao(aoExpirar);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respostaFalsa(401, { error: 'Sessão expirou.' })));

    await expect(api.get('/api/clients')).rejects.toThrow();
    expect(lerToken()).toBeNull();
    expect(aoExpirar).toHaveBeenCalledOnce();
  });

  it('não derruba a sessão quando o 401 é de login mal sucedido', async () => {
    // Senha errada não deve limpar o estado de quem já estava logado noutra aba.
    guardarToken('token-valido');
    const aoExpirar = vi.fn();
    registrarExpiracaoDeSessao(aoExpirar);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(respostaFalsa(401, { error: 'E-mail ou senha incorretos.' })),
    );

    await expect(api.post('/api/auth/login', {})).rejects.toThrow();
    expect(lerToken()).toBe('token-valido');
    expect(aoExpirar).not.toHaveBeenCalled();
  });
});

describe('formatação', () => {
  it.each([
    [0, 'R$ 0,00'],
    [210.39, 'R$ 210,39'],
    [1234.5, 'R$ 1.234,50'],
  ])('formata %s como %s', (valor, esperado) => {
    // O espaço do Intl é não separável (U+00A0), não o espaço comum.
    expect(formatarMoeda(valor).replace(/ /g, ' ')).toBe(esperado);
  });

  it('trata null e undefined como zero em vez de "NaN"', () => {
    expect(formatarMoeda(null)).toContain('0,00');
    expect(formatarMoeda(undefined)).toContain('0,00');
  });

  it('mostra travessão para data ausente ou inválida', () => {
    expect(formatarData(null)).toBe('—');
    expect(formatarData('')).toBe('—');
    expect(formatarData('nao-e-data')).toBe('—');
  });

  it('formata data no padrão brasileiro', () => {
    expect(formatarData('2026-03-15T12:00:00.000Z')).toBe('15/03/2026');
  });
});

describe('leitura de itens', () => {
  it('aceita array direto', () => {
    expect(lerItens([{ type: 'part' }])).toHaveLength(1);
  });

  it('aceita JSON em texto, por compatibilidade', () => {
    expect(lerItens('[{"type":"part"}]')).toHaveLength(1);
  });

  it('devolve lista vazia para conteúdo corrompido em vez de estourar', () => {
    // Uma OS antiga com items inválido não pode derrubar a tela inteira.
    expect(lerItens('{{{ nao e json')).toEqual([]);
    expect(lerItens(null)).toEqual([]);
    expect(lerItens('')).toEqual([]);
    expect(lerItens('{"nao":"array"}')).toEqual([]);
  });
});

describe('URL de arquivo', () => {
  it('completa caminho relativo com a base da API', () => {
    expect(api.urlArquivo('/uploads/a.png')).toMatch(/^https?:\/\/.+\/uploads\/a\.png$/);
  });

  it('preserva URL absoluta', () => {
    expect(api.urlArquivo('https://cdn.exemplo.com/a.png')).toBe('https://cdn.exemplo.com/a.png');
  });
});

describe('ApiError', () => {
  it('é instância de Error e carrega o status', () => {
    const erro = new ApiError('falhou', 500);
    expect(erro).toBeInstanceOf(Error);
    expect(erro.status).toBe(500);
  });
});
