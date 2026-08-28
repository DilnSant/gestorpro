import express from 'express';
import cors from 'cors';

import authRoutes from './routes/auth';
import clientRoutes from './routes/clients';
import vehicleRoutes from './routes/vehicles';
import serviceOrderRoutes from './routes/serviceOrders';
import quoteRoutes from './routes/quotes';
import noteRoutes from './routes/notes';
import companyRoutes from './routes/company';
import uploadRoutes from './routes/upload';
import fileRoutes from './routes/files';

/**
 * Monta o app sem abrir porta.
 *
 * Separado do index.ts para os testes conseguirem subir o servidor no endereço
 * que quiserem, sem competir com a instância de desenvolvimento.
 */
export function criarApp() {
  const app = express();

  // Em desenvolvimento o frontend roda em outra porta, então a origem precisa ser
  // liberada explicitamente. `cors()` sem argumento libera qualquer origem, o que
  // não pode ir a produção.
  const ORIGENS = (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:4173')
    .split(',')
    .map((origem) => origem.trim())
    .filter(Boolean);

  app.use(cors({ origin: ORIGENS, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  // NÃO reintroduzir um mount estático aqui. Arquivo é dado de uma oficina e sai
  // por /api/files, que confere propriedade. `express.static` roda antes de
  // qualquer autenticação e serviria o arquivo de qualquer tenant a quem tivesse
  // a URL — foi o achado crítico da auditoria.

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/api/auth', authRoutes);
  app.use('/api/clients', clientRoutes);
  app.use('/api/vehicles', vehicleRoutes);
  app.use('/api/service-orders', serviceOrderRoutes);
  app.use('/api/quotes', quoteRoutes);
  app.use('/api/notes', noteRoutes);
  app.use('/api/company', companyRoutes);
  app.use('/api/upload', uploadRoutes);
  app.use('/api/files', fileRoutes);

  // Rede de segurança: sem isto, um erro não tratado dentro de um handler async
  // derruba a requisição sem resposta e vaza o stack trace na saída padrão.
  app.use(
    (
      erro: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error('Erro não tratado:', erro);
      if (res.headersSent) return;
      res.status(500).json({ error: 'Algo deu errado. Tente novamente.' });
    },
  );

  return app;
}
