import { PrismaClient } from '@prisma/client';

// Instância única. Cada `new PrismaClient()` abre seu próprio pool de conexões;
// um por arquivo de rota esgota o limite do banco conforme as rotas crescem.
export const prisma = new PrismaClient();
