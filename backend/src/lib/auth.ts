import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import type { Papel } from './roles';

// Sem segredo não há assinatura confiável. Falhar na partida é melhor que subir
// um servidor que aceita tokens que qualquer um consegue forjar.
function lerSegredo(): string {
  const valor = process.env.JWT_SECRET;
  if (!valor || valor.length < 16) {
    throw new Error(
      'JWT_SECRET ausente ou curto demais. Defina um valor longo e aleatório no .env ' +
        'antes de iniciar o servidor.',
    );
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
    const conteudo = jwt.verify(token, SEGREDO) as jwt.JwtPayload;
    if (typeof conteudo.sub !== 'string') return null;
    return {
      sub: conteudo.sub,
      role: conteudo.role,
      company_id: typeof conteudo.company_id === 'string' ? conteudo.company_id : null,
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
