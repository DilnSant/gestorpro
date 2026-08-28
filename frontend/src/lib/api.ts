// Ponto único de acesso à API.
//
// A identidade viaja no token, no header Authorization. Antes ia um
// `x-company-id` escolhido pelo próprio navegador — bastava trocá-lo para ler os
// dados de outra oficina.

// Em produção, frontend e API compartilham a origem: o `vercel.json` reescreve
// `/api/*` para a função. Base vazia significa caminho relativo — e sem origem
// cruzada não há CORS nem preflight.
// Em desenvolvimento, o backend roda em outra porta.
const BASE_URL =
  import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:3000' : '');

const CHAVE_TOKEN = 'gestorpro_token';

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

export const guardarToken = (token: string) => localStorage.setItem(CHAVE_TOKEN, token);
export const descartarToken = () => localStorage.removeItem(CHAVE_TOKEN);
export const lerToken = () => {
  try {
    return localStorage.getItem(CHAVE_TOKEN);
  } catch {
    return null;
  }
};

/** Chamado quando o servidor recusa o token, para o app voltar ao login. */
let aoExpirarSessao: (() => void) | null = null;
export const registrarExpiracaoDeSessao = (callback: () => void) => {
  aoExpirarSessao = callback;
};

async function requisicao<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);

  const token = lerToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

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
    // 401 significa token ausente, inválido ou expirado: derruba a sessão em vez
    // de deixar a tela tentando de novo com uma credencial que já não vale.
    if (resposta.status === 401 && !caminho.startsWith('/api/auth/login')) {
      descartarToken();
      aoExpirarSessao?.();
    }
    // O backend responde { error: "mensagem em português" }. Repassar essa
    // mensagem é o que permite a tela dizer o que de fato deu errado.
    throw new ApiError(dados?.error ?? 'Não foi possível concluir a operação.', resposta.status);
  }

  return dados as T;
}

export const api = {
  get: <T>(caminho: string) => requisicao<T>(caminho),
  post: <T>(caminho: string, corpo?: unknown) =>
    requisicao<T>(caminho, { method: 'POST', body: corpo === undefined ? undefined : JSON.stringify(corpo) }),
  put: <T>(caminho: string, corpo: unknown) =>
    requisicao<T>(caminho, { method: 'PUT', body: JSON.stringify(corpo) }),
  delete: (caminho: string) => requisicao<void>(caminho, { method: 'DELETE' }),

  upload: async (arquivos: FileList | File[]) => {
    const form = new FormData();
    Array.from(arquivos).forEach((arquivo) => form.append('files', arquivo));
    return requisicao<{ files: ArquivoEnviado[] }>('/api/upload', { method: 'POST', body: form });
  },

  /**
   * Completa uma URL de arquivo com a base da API.
   *
   * Preserva a query string intacta: é nela que viaja a assinatura (`?t=`) que
   * permite ao `<img>` e ao `<a>` buscarem o arquivo sem header — o browser faz
   * essas requisições sozinho e não envia Authorization.
   */
  urlArquivo: (caminho: string) => (caminho.startsWith('http') ? caminho : `${BASE_URL}${caminho}`),
};

export const formatarMoeda = (valor: number | null | undefined) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor ?? 0);

export const formatarData = (valor: string | Date | null | undefined) => {
  if (!valor) return '—';
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? '—' : data.toLocaleDateString('pt-BR');
};

/** A API já devolve `items` como array; a checagem cobre resposta inesperada. */
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

export type ArquivoEnviado = {
  id: string;
  /** Referência estável, a que se persiste. Não expira. */
  url: string;
  /** URL assinada, pronta para renderizar. Expira — nunca gravar no banco. */
  view_url: string;
  name: string;
  size: number;
  mime: string;
};

export type Item = {
  type: 'service' | 'part';
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
};
