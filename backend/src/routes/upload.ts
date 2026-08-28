import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { prisma } from '../prisma';
import {
  empresaDaRequisicao,
  exigirAutenticacao,
  exigirEmpresa,
  usuarioDaRequisicao,
} from '../middleware/authMiddleware';
import {
  PASTA_UPLOADS,
  assinarUrlArquivo,
  detectarMime,
  extensaoCombina,
  MIMES_PERMITIDOS,
} from '../lib/arquivos';

const router = Router();

fs.mkdirSync(PASTA_UPLOADS, { recursive: true });

// Extensões aceitas na porta de entrada. `.svg` ficou de fora de propósito: é XML
// executável, e servido como image/svg+xml na origem da API vira XSS armazenado.
// A palavra final, porém, é do conteúdo — ver detectarMime abaixo.
const EXTENSOES_PERMITIDAS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.pdf', '.txt', '.csv', '.doc', '.docx', '.xls', '.xlsx',
]);

const limiteUpload = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.RATE_LIMIT_DISABLED === '1',
  message: { error: 'Muitos envios em pouco tempo. Aguarde alguns minutos.' },
});

// Memória, não disco: o conteúdo precisa ser inspecionado antes de virar arquivo.
// Gravar primeiro e checar depois deixaria uma janela em que o arquivo malicioso
// existe no volume.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    const extensao = path.extname(file.originalname).toLowerCase();
    if (!EXTENSOES_PERMITIDAS.has(extensao)) return cb(new Error('TIPO_NAO_PERMITIDO'));
    cb(null, true);
  },
});

router.use(limiteUpload, exigirAutenticacao, exigirEmpresa);

router.post('/', (req, res) => {
  upload.array('files', 5)(req, res, async (erro: unknown) => {
    if (erro instanceof multer.MulterError) {
      if (erro.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Cada arquivo pode ter no máximo 10 MB.' });
      }
      return res.status(400).json({ error: 'Não foi possível enviar os arquivos.' });
    }
    if (erro instanceof Error && erro.message === 'TIPO_NAO_PERMITIDO') {
      return res.status(400).json({ error: 'Tipo de arquivo não permitido.' });
    }
    if (erro) return res.status(400).json({ error: 'Não foi possível enviar os arquivos.' });

    const companyId = empresaDaRequisicao(req);
    const usuario = usuarioDaRequisicao(req);
    const arquivos = (req.files as Express.Multer.File[] | undefined) ?? [];

    if (arquivos.length === 0) {
      return res.status(400).json({ error: 'Nenhum arquivo foi enviado.' });
    }

    // O tipo vem do conteúdo, nunca do nome. Um .png cujo miolo é HTML é recusado.
    const validados = [];
    for (const arquivo of arquivos) {
      const extensao = path.extname(arquivo.originalname).toLowerCase();
      const mime = detectarMime(arquivo.buffer, extensao);

      if (!mime || !MIMES_PERMITIDOS.has(mime)) {
        return res.status(400).json({
          error: `O conteúdo de "${arquivo.originalname}" não corresponde a um tipo aceito.`,
        });
      }
      if (!extensaoCombina(mime, extensao)) {
        return res.status(400).json({
          error: `A extensão de "${arquivo.originalname}" não corresponde ao conteúdo do arquivo.`,
        });
      }
      validados.push({ arquivo, mime });
    }

    // Subdiretório por empresa: encerrar uma oficina passa a ser um rm -rf de uma
    // pasta, e não uma varredura do volume inteiro atrás dos arquivos dela.
    const pastaDaEmpresa = path.join(PASTA_UPLOADS, companyId);
    fs.mkdirSync(pastaDaEmpresa, { recursive: true });

    const criados = [];
    for (const { arquivo, mime } of validados) {
      // Sem extensão em disco: é a extensão que permitiria a um servidor estático
      // adivinhar o tipo e servir o arquivo executável.
      const storageKey = path.join(companyId, randomUUID());
      fs.writeFileSync(path.join(PASTA_UPLOADS, storageKey), arquivo.buffer);

      const registro = await prisma.upload.create({
        data: {
          company_id: companyId,
          uploaded_by: usuario.id,
          storage_key: storageKey,
          original_name: arquivo.originalname.slice(0, 255),
          mime_type: mime,
          size_bytes: arquivo.size,
          checksum_sha256: createHash('sha256').update(arquivo.buffer).digest('hex'),
        },
      });

      criados.push({
        id: registro.id,
        // A referência que se persiste. Nunca a URL assinada — ela expira.
        url: `/api/files/${registro.id}`,
        // A URL pronta para renderizar agora, sem precisar de outro roundtrip.
        view_url: assinarUrlArquivo(registro.id, companyId),
        name: registro.original_name,
        size: registro.size_bytes,
        mime: registro.mime_type,
      });
    }

    res.status(201).json({ files: criados });
  });
});

export { PASTA_UPLOADS };
export default router;
