import { randomUUID } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

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

  // Número exato de proxies, nunca `true`. Sem isto, atrás de nginx ou Cloudflare
  // todos os clientes compartilham o IP do proxy — e o rate limit vira um balde
  // único de 20 logins por 15 min para a internet inteira.
  app.set('trust proxy', Number(process.env.TRUSTED_PROXIES ?? 0));

  app.disable('x-powered-by');
  app.use(
    helmet({
      // A API não serve HTML; a CSP restritiva vive na rota de arquivos.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: false,
    }),
  );

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

  // Diagnóstico de conectividade com o banco.
  //
  // O /health acima não toca no Prisma, então responde OK mesmo com o banco
  // inacessível — foi exatamente o que mascarou a falha no primeiro deploy.
  // Este devolve o código de erro do Prisma (P1001 = sem conexão, P1000 =
  // credencial recusada), que não é dado sensível e permite diagnosticar sem
  // acesso ao log da plataforma.
  app.get('/health/db', async (_req, res) => {
    const { prisma } = await import('./prisma');
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ ok: true, db: 'conectado' });
    } catch (erro) {
      const codigo =
        (erro as { errorCode?: string })?.errorCode ??
        (erro as { code?: string })?.code ??
        'desconhecido';
      const nome = erro instanceof Error ? erro.name : 'ErroDesconhecido';
      res.status(503).json({ ok: false, db: 'indisponível', codigo, nome });
    }
  });

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
      req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      // NUNCA serialize o objeto de erro aqui. O PrismaClientValidationError
      // imprime a invocação COM os valores dos argumentos — chassi de veículo,
      // descrição de item, e potencialmente CPF e endereço de cliente foram
      // confirmados no log durante a auditoria. Só nome, código e rota.
      const referencia = randomUUID().slice(0, 8);
      const nome = erro instanceof Error ? erro.name : 'ErroDesconhecido';
      const codigo = (erro as { code?: unknown })?.code;
      console.error(
        `[${referencia}] ${nome}${codigo ? ` (${String(codigo)})` : ''} em ${req.method} ${req.path}`,
      );

      if (res.headersSent) return;

      // Corpo JSON malformado é erro do cliente, não do servidor.
      const status = (erro as { status?: number; statusCode?: number })?.status
        ?? (erro as { statusCode?: number })?.statusCode;
      if (status === 400 || nome === 'SyntaxError') {
        return res.status(400).json({ error: 'Requisição malformada.', ref: referencia });
      }

      res.status(500).json({ error: 'Algo deu errado. Tente novamente.', ref: referencia });
    },
  );

  return app;
}
