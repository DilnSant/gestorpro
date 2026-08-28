import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import type { Papel } from './roles';

// Sem segredo não há assinatura confiável. Falhar na partida é melhor que subir
// um servidor que aceita tokens que qualquer um consegue forjar.
/** Frases que denunciam um segredo de exemplo copiado sem trocar. */
const MARCAS_DE_PLACEHOLDER = [
  'trocar',
  'exemplo',
  'example',
  'desenvolvimento',
  'development',
  'changeme',
  'seu-segredo',
  'gere-um',
];

function lerSegredo(): string {
  const valor = process.env.JWT_SECRET;
  if (!valor || valor.length < 16) {
    throw new Error(
      'JWT_SECRET ausente ou curto demais. Defina um valor longo e aleatório no .env ' +
        'antes de iniciar o servidor.',
    );
  }

  // Em produção, comprimento não basta: o valor do .env.example passa nele e é
  // adivinhável. Quem descobre o segredo forja role:'admin' e company_id de
  // qualquer oficina — não há segunda barreira depois da verificação do token.
  if (process.env.NODE_ENV === 'production') {
    const minusculo = valor.toLowerCase();
    if (MARCAS_DE_PLACEHOLDER.some((marca) => minusculo.includes(marca))) {
      throw new Error(
        'JWT_SECRET parece ser o valor de exemplo. Gere um segredo aleatório antes de ' +
          'subir em produção — com ele é possível forjar acesso de administrador.',
      );
    }
    if (valor.length < 32) {
      throw new Error('JWT_SECRET precisa ter ao menos 32 caracteres em produção.');
    }
  }

  return valor;
}

const SEGREDO = lerSegredo();

const VALIDADE = '12h';

export type ConteudoToken = {
  sub: string;
  role: Papel;
  /// A empresa vem daqui e de nenhum outro lugar. É o que garante o isolamento:
  /// um header ou um campo do corpo seriam escolhidos pelo próprio cliente.
  company_id: string | null;
  /// Momento da emissão, em segundos. Usado para invalidar tokens anteriores a
  /// uma troca de senha.
  iat?: number;
};

export const gerarHash = (senha: string) => argon2.hash(senha, { type: argon2.argon2id });

export async function conferirSenha(hash: string, senha: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, senha);
  } catch {
    // Hash malformado (por exemplo, um registro antigo em texto puro) não é
    // motivo para derrubar a rota — é uma tentativa que não confere.
    return false;
  }
}

export const assinarToken = (dados: ConteudoToken) =>
  jwt.sign(dados, SEGREDO, { expiresIn: VALIDADE });

export function verificarToken(token: string): ConteudoToken | null {
  try {
    // `algorithms` fixado: sem isso, o comportamento depende do padrão da
    // biblioteca, que pode mudar entre versões.
    const conteudo = jwt.verify(token, SEGREDO, { algorithms: ['HS256'] }) as jwt.JwtPayload;

    // Token de arquivo carrega `aud` e nunca pode servir como token de sessão.
    // Ele já é assinado com outro segredo; esta é a segunda barreira.
    if (conteudo.aud !== undefined) return null;

    if (typeof conteudo.sub !== 'string') return null;
    return {
      sub: conteudo.sub,
      role: conteudo.role,
      company_id: typeof conteudo.company_id === 'string' ? conteudo.company_id : null,
      iat: typeof conteudo.iat === 'number' ? conteudo.iat : undefined,
    };
  } catch {
    return null;
  }
}

// Política mínima de senha. Curta o bastante para não irritar o dono da oficina,
// longa o bastante para não ser adivinhada em segundos.
export const TAMANHO_MINIMO_SENHA = 8;

export function validarSenha(senha: unknown): string | null {
  if (typeof senha !== 'string' || senha.length < TAMANHO_MINIMO_SENHA) {
    return `A senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`;
  }
  if (senha.length > 200) return 'A senha é longa demais.';
  return null;
}

// Bloqueio progressivo depois de tentativas erradas seguidas.
export const TENTATIVAS_ATE_BLOQUEIO = 5;
export const MINUTOS_BLOQUEIO = 15;
