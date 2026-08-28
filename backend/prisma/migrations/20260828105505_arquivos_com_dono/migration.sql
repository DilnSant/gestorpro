-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "company_id" TEXT NOT NULL,
    "uploaded_by" TEXT,
    "storage_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL DEFAULT 0,
    "checksum_sha256" TEXT,
    "deleted_at" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Upload_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Upload_storage_key_key" ON "Upload"("storage_key");

-- CreateIndex
CREATE INDEX "Upload_company_id_idx" ON "Upload"("company_id");

-- CreateIndex
CREATE INDEX "Upload_company_id_deleted_at_idx" ON "Upload"("company_id", "deleted_at");


-- ---------------------------------------------------------------------------
-- Backfill dos arquivos que já existem.
--
-- O dono de um arquivo antigo não está em lugar nenhum do disco: está em quem o
-- referencia. Por isso a origem é Company.logo_url e Note.file_urls.
--
-- Esta migração NÃO reescreve essas colunas. É o que garante que nada quebra: as
-- referências antigas continuam válidas porque o resolvedor de leitura aceita
-- tanto "/api/files/<id>" quanto o legado "/uploads/<chave>".
--
-- Arquivos em disco sem linha correspondente (órfãos de notas já apagadas) ficam
-- sem dono e portanto inalcançáveis — que é o resultado desejado.
--
-- size_bytes fica 0 nos legados: SQL não lê o disco. É só metadado.
-- ---------------------------------------------------------------------------

-- Logo das empresas
INSERT OR IGNORE INTO "Upload" (
  "id", "company_id", "storage_key", "original_name", "mime_type", "size_bytes", "createdAt"
)
SELECT
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
    substr(lower(hex(randomblob(2))), 2) || '-a' ||
    substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
  c."id",
  replace(c."logo_url", '/uploads/', ''),
  replace(c."logo_url", '/uploads/', ''),
  CASE
    WHEN lower(c."logo_url") LIKE '%.png'  THEN 'image/png'
    WHEN lower(c."logo_url") LIKE '%.jpg'  THEN 'image/jpeg'
    WHEN lower(c."logo_url") LIKE '%.jpeg' THEN 'image/jpeg'
    WHEN lower(c."logo_url") LIKE '%.gif'  THEN 'image/gif'
    WHEN lower(c."logo_url") LIKE '%.webp' THEN 'image/webp'
    ELSE 'application/octet-stream'
  END,
  0,
  CURRENT_TIMESTAMP
FROM "Company" c
WHERE c."logo_url" IS NOT NULL AND c."logo_url" LIKE '/uploads/%';

-- Anexos das notas (file_urls é um array JSON guardado em texto)
INSERT OR IGNORE INTO "Upload" (
  "id", "company_id", "storage_key", "original_name", "mime_type", "size_bytes", "createdAt"
)
SELECT
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
    substr(lower(hex(randomblob(2))), 2) || '-a' ||
    substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
  n."company_id",
  replace(j.value, '/uploads/', ''),
  replace(j.value, '/uploads/', ''),
  CASE
    WHEN lower(j.value) LIKE '%.png'  THEN 'image/png'
    WHEN lower(j.value) LIKE '%.jpg'  THEN 'image/jpeg'
    WHEN lower(j.value) LIKE '%.jpeg' THEN 'image/jpeg'
    WHEN lower(j.value) LIKE '%.gif'  THEN 'image/gif'
    WHEN lower(j.value) LIKE '%.webp' THEN 'image/webp'
    WHEN lower(j.value) LIKE '%.pdf'  THEN 'application/pdf'
    WHEN lower(j.value) LIKE '%.txt'  THEN 'text/plain'
    WHEN lower(j.value) LIKE '%.csv'  THEN 'text/csv'
    ELSE 'application/octet-stream'
  END,
  0,
  CURRENT_TIMESTAMP
FROM "Note" n, json_each(n."file_urls") j
WHERE n."file_urls" IS NOT NULL
  AND json_valid(n."file_urls")
  AND json_type(n."file_urls") = 'array'
  AND j.value LIKE '/uploads/%';
