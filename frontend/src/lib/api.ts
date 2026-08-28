// Ponto único de acesso à API.
//
// Antes, cada página repetia `fetch('http://localhost:3000/...')` com os headers
// montados à mão, e nenhuma delas checava `response.ok` — um erro 400 do servidor
// virava `undefined` na tela em vez de mensagem.

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  // Campo declarado e atribuído no corpo: `erasableSyntaxOnly` do projeto não
  // aceita a forma abreviada de parâmetro-propriedade no construtor.
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function empresaAtual(): string {
  try {
    const bruto = localStorage.getItem('gestorpro_user');
    if (!bruto) return '';
    return JSON.parse(bruto)?.company_id ?? '';
  } catch {
    return '';
  }
}

async function requisicao<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('x-company-id', empresaAtual());
  if (init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  let resposta: Response;
  try {
    resposta = await fetch(`${BASE_URL}${caminho}`, { ...init, headers });
  } catch {
    throw new ApiError('Não foi possível falar com o servidor. Verifique sua conexão.', 0);
  }

  if (resposta.status === 204) return undefined as T;

  const texto = await resposta.text();
  const dados = texto ? JSON.parse(texto) : null;

  if (!resposta.ok) {
    // O backend responde { error: "mensagem em português" }. Repassar essa
    // mensagem é o que permite a tela dizer o que de fato deu errado.
    throw new ApiError(dados?.error ?? 'Não foi possível concluir a operação.', resposta.status);
  }

  return dados as T;
}

export const api = {
  get: <T>(caminho: string) => requisicao<T>(caminho),
  post: <T>(caminho: string, corpo?: unknown) =>
    requisicao<T>(caminho, { method: 'POST', body: corpo ? JSON.stringify(corpo) : undefined }),
  put: <T>(caminho: string, corpo: unknown) =>
    requisicao<T>(caminho, { method: 'PUT', body: JSON.stringify(corpo) }),
  delete: (caminho: string) => requisicao<void>(caminho, { method: 'DELETE' }),

  upload: async (arquivos: FileList | File[]) => {
    const form = new FormData();
    Array.from(arquivos).forEach((arquivo) => form.append('files', arquivo));
    return requisicao<{ files: { url: string; name: string; size: number }[] }>('/api/upload', {
      method: 'POST',
      body: form,
    });
  },

  /** Transforma um caminho relativo devolvido pelo upload em URL absoluta. */
  urlArquivo: (caminho: string) =>
    caminho.startsWith('http') ? caminho : `${BASE_URL}${caminho}`,
};

export const formatarMoeda = (valor: number | null | undefined) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor ?? 0);

export const formatarData = (valor: string | Date | null | undefined) => {
  if (!valor) return '—';
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? '—' : data.toLocaleDateString('pt-BR');
};

/** O campo `items` é JSON guardado em texto; nunca confie que veio íntegro. */
export function lerItens(bruto: unknown): Item[] {
  if (Array.isArray(bruto)) return bruto as Item[];
  if (typeof bruto !== 'string' || bruto.trim() === '') return [];
  try {
    const lista = JSON.parse(bruto);
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

export type Item = {
  type: 'service' | 'part';
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
};
