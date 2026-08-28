import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';
import { verificarToken } from '../lib/auth';
import { ehAdmin, type Papel } from '../lib/roles';

// A identidade vem do token assinado, nunca da requisição.
//
// Antes deste arquivo, o tenant chegava no header `x-company-id` e o papel no
// `x-role` — ambos escolhidos pelo cliente. Bastava trocar o header para ler os
// dados de qualquer oficina, e `x-role: admin` dispensava o company_id, momento
// em que `where: { company_id: undefined }` deixava de filtrar e devolvia todos
// os tenants de uma vez.

declare global {
  namespace Express {
    interface Request {
      usuario?: { id: string; role: Papel; company_id: string | null };
      /// OPCIONAL de propósito. Só existe depois de `exigirEmpresa`.
      /// Não leia direto: use `empresaDaRequisicao(req)`.
      companyId?: string;
    }
  }
}

/**
 * A empresa da requisição, garantida como string não vazia.
 *
 * Existe porque o tipo antes declarava `companyId: string` não-opcional, e a
 * garantia morava num comentário. Qualquer rota que esquecesse `exigirEmpresa`
 * compilava e entregava `undefined` a um `where` do Prisma — que não filtra nada
 * e devolve todos os tenants. Agora o compilador recusa o acesso direto, e este
 * acessor falha alto em vez de vazar em silêncio.
 */
export function empresaDaRequisicao(req: Request): string {
  const empresa = req.companyId;
  if (typeof empresa !== 'string' || empresa === '') {
    throw new Error(
      'Rota sem escopo de empresa: aplique `rotaDaEmpresa` (ou `exigirEmpresa`) antes de consultar dados de negócio.',
    );
  }
  return empresa;
}

/** O usuário autenticado, garantido. Só após `exigirAutenticacao`. */
export function usuarioDaRequisicao(req: Request): { id: string; role: Papel; company_id: string | null } {
  const usuario = req.usuario;
  if (!usuario) {
    throw new Error('Rota sem autenticação: aplique `exigirAutenticacao` antes de ler o usuário.');
  }
  return usuario;
}

function lerToken(req: Request): string | null {
  const cabecalho = req.headers.authorization;
  if (typeof cabecalho !== 'string') return null;
  const [tipo, valor] = cabecalho.split(' ');
  if (tipo !== 'Bearer' || !valor) return null;
  return valor;
}

/**
 * Exige um token de sessão válido, e que ele ainda valha. Popula `req.usuario`.
 *
 * Assinatura e validade não bastam. Sem as duas checagens abaixo, `password_changed_at`
 * era gravado e nunca lido, e trocar a senha ou sair da impersonação não expulsava
 * ninguém: o token anterior continuava funcionando por até 12h — justamente a ação
 * que a vítima toma acreditando ter resolvido o problema.
 */
export async function exigirAutenticacao(req: Request, res: Response, next: NextFunction) {
  const token = lerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Faça login para continuar.' });
  }

  const conteudo = verificarToken(token);
  if (!conteudo) {
    return res.status(401).json({ error: 'Sua sessão expirou. Entre novamente.' });
  }

  const usuario = await prisma.user.findUnique({
    where: { id: conteudo.sub },
    select: { id: true, role: true, company_id: true, password_changed_at: true },
  });

  if (!usuario) {
    return res.status(401).json({ error: 'Sua sessão expirou. Entre novamente.' });
  }

  // Trocar a senha invalida os tokens emitidos antes.
  if (usuario.password_changed_at && conteudo.iat !== undefined) {
    const trocadaEm = Math.floor(usuario.password_changed_at.getTime() / 1000);
    if (conteudo.iat < trocadaEm) {
      return res.status(401).json({ error: 'Sua senha mudou. Entre novamente.' });
    }
  }

  // A empresa do token precisa bater com a atual. É o que faz "sair da
  // impersonação" ter efeito: comparar só o `iat` não separaria os dois tokens,
  // porque a troca acontece no mesmo segundo.
  if ((conteudo.company_id ?? null) !== (usuario.company_id ?? null)) {
    return res.status(401).json({ error: 'Seu acesso mudou. Entre novamente.' });
  }

  req.usuario = {
    id: usuario.id,
    role: usuario.role as Papel,
    company_id: usuario.company_id,
  };
  next();
}

/**
 * Exige que o usuário autenticado tenha uma empresa. Popula `req.companyId`.
 *
 * A checagem de string não vazia é o que impede o `undefined` de chegar a um
 * `where` do Prisma e apagar o filtro de tenant.
 */
export function exigirEmpresa(req: Request, res: Response, next: NextFunction) {
  const empresa = req.usuario?.company_id;

  if (typeof empresa !== 'string' || empresa.trim() === '') {
    return res.status(403).json({
      error: 'Nenhuma oficina selecionada. Conclua o cadastro da empresa para continuar.',
    });
  }

  req.companyId = empresa.trim();
  next();
}

/** Rotas da plataforma, restritas ao dono dela. */
export function exigirAdmin(req: Request, res: Response, next: NextFunction) {
  if (!ehAdmin(req.usuario?.role)) {
    // 404 em vez de 403: não confirma para um usuário comum que a rota existe.
    return res.status(404).json({ error: 'Não encontrado.' });
  }
  next();
}

/** Atalho para as rotas de negócio: autenticado E com empresa. */
export const rotaDaEmpresa = [exigirAutenticacao, exigirEmpresa];
