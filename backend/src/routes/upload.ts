import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { Router } from 'express';
import multer from 'multer';
import { rotaDaEmpresa } from '../middleware/authMiddleware';

const router = Router();

export const PASTA_UPLOADS = path.resolve(__dirname, '../../uploads');
fs.mkdirSync(PASTA_UPLOADS, { recursive: true });

const EXTENSOES_PERMITIDAS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
  '.pdf', '.txt', '.csv', '.doc', '.docx', '.xls', '.xlsx',
]);

const armazenamento = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PASTA_UPLOADS),
  filename: (_req, file, cb) => {
    // O nome original nunca vira nome de arquivo em disco: "../../etc/passwd" ou
    // um nome com caractere de controle passaria direto para o filesystem.
    const extensao = path.extname(file.originalname).toLowerCase();
    cb(null, `${randomUUID()}${extensao}`);
  },
});

const upload = multer({
  storage: armazenamento,
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    const extensao = path.extname(file.originalname).toLowerCase();
    if (!EXTENSOES_PERMITIDAS.has(extensao)) {
      return cb(new Error('TIPO_NAO_PERMITIDO'));
    }
    cb(null, true);
  },
});

router.use(rotaDaEmpresa);

router.post('/', (req, res) => {
  upload.array('files', 5)(req, res, (erro: unknown) => {
    if (erro instanceof multer.MulterError) {
      if (erro.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Cada arquivo pode ter no máximo 10 MB.' });
      }
      return res.status(400).json({ error: 'Não foi possível enviar os arquivos.' });
    }
    if (erro instanceof Error && erro.message === 'TIPO_NAO_PERMITIDO') {
      return res.status(400).json({ error: 'Tipo de arquivo não permitido.' });
    }
    if (erro) {
      return res.status(400).json({ error: 'Não foi possível enviar os arquivos.' });
    }

    const arquivos = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (arquivos.length === 0) {
      return res.status(400).json({ error: 'Nenhum arquivo foi enviado.' });
    }

    res.status(201).json({
      files: arquivos.map((arquivo) => ({
        url: `/uploads/${arquivo.filename}`,
        name: arquivo.originalname,
        size: arquivo.size,
      })),
    });
  });
});

export default router;
