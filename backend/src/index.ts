import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { prisma } from './prisma';

import clientRoutes from './routes/clients';
import vehicleRoutes from './routes/vehicles';
import serviceOrderRoutes from './routes/serviceOrders';
import quoteRoutes from './routes/quotes';
import noteRoutes from './routes/notes';
import companyRoutes from './routes/company';
import uploadRoutes, { PASTA_UPLOADS } from './routes/upload';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/uploads', express.static(PASTA_UPLOADS));

app.use('/api/clients', clientRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/service-orders', serviceOrderRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/upload', uploadRoutes);

// O Prisma devolve todos os escalares por padrão, inclusive `password`. Sem este
// select, `res.json(user)` entregava o hash da senha ao navegador.
const CAMPOS_PUBLICOS_USUARIO = {
  id: true,
  email: true,
  name: true,
  role: true,
  company_id: true,
  createdAt: true,
} as const;

// ============================================================================
// AUTENTICAÇÃO SIMULADA — NÃO É AUTENTICAÇÃO (BACKLOG 08)
//
// Estas duas rotas não verificam nada: o login aceita qualquer e-mail, cria a
// conta se não existir e devolve um token constante. Elas existem só para
// destravar o desenvolvimento local do frontend.
//
// A guarda abaixo impede que isso suba em produção por esquecimento — que é
// exatamente como stubs de autenticação costumam vazar.
// ============================================================================
if (process.env.NODE_ENV === 'production') {
  throw new Error(
    'As rotas de autenticação ainda são simuladas (BACKLOG 08). ' +
      'Implemente hash de senha e JWT verificado antes de rodar em produção.',
  );
}

app.post('/api/auth/login', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';

  // Antes: `email.split('@')[0]` com email ausente lançava TypeError e virava 500.
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Informe um e-mail válido.' });
  }

  try {
    let user = await prisma.user.findUnique({
      where: { email },
      select: CAMPOS_PUBLICOS_USUARIO,
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          password: 'SIMULADO_NAO_E_SENHA',
          name: email.split('@')[0] ?? email,
        },
        select: CAMPOS_PUBLICOS_USUARIO,
      });
    }

    res.json({ token: 'fake-jwt-token', user });
  } catch (error) {
    res.status(500).json({ error: 'Não foi possível entrar.' });
  }
});

// BACKLOG 05 — esta rota confia no `userId` do corpo da requisição, então qualquer
// um pode mover qualquer usuário para qualquer empresa.
app.post('/api/auth/updateMe', async (req, res) => {
  const userId = typeof req.body?.userId === 'string' ? req.body.userId : '';
  const bruto = req.body?.company_id;

  if (!userId) {
    return res.status(400).json({ error: 'Usuário não identificado.' });
  }

  // `null` é um valor legítimo aqui: é como o admin sai da impersonação e volta
  // ao painel administrativo.
  let companyId: string | null;
  if (bruto === null) {
    companyId = null;
  } else if (typeof bruto === 'string' && bruto.trim() !== '') {
    companyId = bruto.trim();
  } else {
    return res.status(400).json({ error: 'Empresa inválida.' });
  }

  if (companyId !== null) {
    const existe = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!existe) return res.status(404).json({ error: 'Empresa não encontrada.' });
  }

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { company_id: companyId },
      select: { ...CAMPOS_PUBLICOS_USUARIO, company: true },
    });
    res.json(user);
  } catch (error) {
    res.status(400).json({ error: 'Não foi possível atualizar o usuário.' });
  }
});

// Setup Inicial de Empresa
// BACKLOG 05 — mesmo problema do updateMe: o `userId` vem do corpo da requisição,
// então qualquer um cria uma empresa e se vincula a qualquer usuário.
app.post('/api/auth/setup-company', async (req, res) => {
  const { userId, name, phone, email, cnpj, address } = req.body ?? {};

  if (typeof userId !== 'string' || !userId) {
    return res.status(400).json({ error: 'Usuário não identificado.' });
  }
  // `name` é obrigatório no schema; sem esta checagem o Prisma lança e vira 500.
  if (typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'O nome da empresa é obrigatório.' });
  }

  try {
    // Numa transação: sem ela, um erro ao vincular o usuário (id inexistente, por
    // exemplo) deixava a empresa já criada órfã no banco — sem dono, sem dados, e
    // ainda assim listada no painel administrativo.
    const user = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: { name: name.trim(), phone, email, cnpj, address, primary_color: '#2563EB' },
      });
      return tx.user.update({
        where: { id: userId },
        data: { company_id: company.id },
        // `include` traria o objeto User inteiro, com o campo `password` junto.
        select: { ...CAMPOS_PUBLICOS_USUARIO, company: true },
      });
    });
    res.json(user);
  } catch (error) {
    res.status(400).json({ error: 'Não foi possível criar a empresa.' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
