import { Request, Response, NextFunction } from 'express';

// ATENÇÃO — DÍVIDA DE SEGURANÇA CONHECIDA (BACKLOG 08)
//
// Este middleware ainda confia no header `x-company-id` enviado pelo cliente.
// Isso NÃO é autenticação: qualquer um que descubra o id de uma empresa lê e
// escreve os dados dela. A correção definitiva é o `company_id` vir de um JWT
// verificado no servidor, e exige mudar frontend e backend juntos.
//
// O que já foi fechado aqui: o caminho em que `companyId` chegava indefinido e
// o filtro do Prisma deixava de existir, expondo TODOS os tenants de uma vez.

declare global {
  namespace Express {
    interface Request {
      companyId: string;
    }
  }
}

export const requireCompanyId = (req: Request, res: Response, next: NextFunction) => {
  const companyId = req.headers['x-company-id'];

  // Precisa ser string não-vazia. Header ausente vem `undefined`; header repetido
  // vem como array — e um array escaparia de uma checagem de truthiness ingênua.
  if (typeof companyId !== 'string' || companyId.trim() === '') {
    return res.status(401).json({ error: 'Empresa não identificada na requisição.' });
  }

  // O header `x-role` foi removido de propósito. Antes, `x-role: admin` dispensava
  // o `x-company-id`, e o handler seguia com `companyId === undefined`. Em Prisma,
  // `where: { company_id: undefined }` não filtra nada: `GET /api/clients` devolvia
  // os clientes de todas as empresas. Papel nunca pode vir de header do cliente.
  req.companyId = companyId.trim();
  next();
};
