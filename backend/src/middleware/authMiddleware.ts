import { Request, Response, NextFunction } from 'express';
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
      usuario: { id: string; role: Papel; company_id: string | null };
      /// Só existe depois de `exigirEmpresa`. String não vazia, garantida.
      companyId: string;
    }
  }
}

function lerToken(req: Request): string | null {
  const cabecalho = req.headers.authorization;
  if (typeof cabecalho !== 'string') return null;
  const [tipo, valor] = cabecalho.split(' ');
  if (tipo !== 'Bearer' || !valor) return null;
  return valor;
}

/** Exige um token válido. Popula `req.usuario`. */
export function exigirAutenticacao(req: Request, res: Response, next: NextFunction) {
  const token = lerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Faça login para continuar.' });
  }

  const conteudo = verificarToken(token);
  if (!conteudo) {
    return res.status(401).json({ error: 'Sua sessão expirou. Entre novamente.' });
  }

  req.usuario = { id: conteudo.sub, role: conteudo.role, company_id: conteudo.company_id };
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

  req.companyId = empresa;
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
