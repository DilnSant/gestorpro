-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'owner',
    "company_id" TEXT,
    "password_changed_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logo_url" TEXT,
    "primary_color" TEXT NOT NULL DEFAULT '#2563EB',
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "cnpj" TEXT,
    "domain" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "uploaded_by" TEXT,
    "storage_key" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL DEFAULT 0,
    "checksum_sha256" TEXT,
    "deleted_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cpf_cnpj" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "year" INTEGER,
    "color" TEXT,
    "km" INTEGER,
    "chassis" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceOrder" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "client_name_snapshot" TEXT NOT NULL,
    "vehicle_plate_snapshot" TEXT NOT NULL,
    "vehicle_desc_snapshot" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "entry_date" TIMESTAMP(3),
    "estimated_date" TIMESTAMP(3),
    "completion_date" TIMESTAMP(3),
    "description" TEXT,
    "notes" TEXT,
    "labor_total_cents" INTEGER NOT NULL DEFAULT 0,
    "parts_total_cents" INTEGER NOT NULL DEFAULT 0,
    "discount_cents" INTEGER NOT NULL DEFAULT 0,
    "total_amount_cents" INTEGER NOT NULL DEFAULT 0,
    "from_quote_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "quote_number" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "client_name_snapshot" TEXT NOT NULL,
    "vehicle_plate_snapshot" TEXT NOT NULL,
    "vehicle_desc_snapshot" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "valid_until" TIMESTAMP(3),
    "description" TEXT,
    "notes" TEXT,
    "labor_total_cents" INTEGER NOT NULL DEFAULT 0,
    "parts_total_cents" INTEGER NOT NULL DEFAULT 0,
    "discount_cents" INTEGER NOT NULL DEFAULT 0,
    "total_amount_cents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceOrderItem" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "service_order_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unit_price_cents" INTEGER NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteItem" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unit_price_cents" INTEGER NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "type" TEXT NOT NULL DEFAULT 'general',
    "related_id" TEXT,
    "file_urls" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_company_id_idx" ON "User"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "Company_cnpj_key" ON "Company"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "Company_domain_key" ON "Company"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "Upload_storage_key_key" ON "Upload"("storage_key");

-- CreateIndex
CREATE INDEX "Upload_company_id_idx" ON "Upload"("company_id");

-- CreateIndex
CREATE INDEX "Upload_company_id_deleted_at_idx" ON "Upload"("company_id", "deleted_at");

-- CreateIndex
CREATE INDEX "Client_company_id_idx" ON "Client"("company_id");

-- CreateIndex
CREATE INDEX "Client_company_id_name_idx" ON "Client"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Client_company_id_cpf_cnpj_key" ON "Client"("company_id", "cpf_cnpj");

-- CreateIndex
CREATE INDEX "Vehicle_company_id_idx" ON "Vehicle"("company_id");

-- CreateIndex
CREATE INDEX "Vehicle_client_id_idx" ON "Vehicle"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_company_id_plate_key" ON "Vehicle"("company_id", "plate");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceOrder_from_quote_id_key" ON "ServiceOrder"("from_quote_id");

-- CreateIndex
CREATE INDEX "ServiceOrder_company_id_idx" ON "ServiceOrder"("company_id");

-- CreateIndex
CREATE INDEX "ServiceOrder_company_id_status_idx" ON "ServiceOrder"("company_id", "status");

-- CreateIndex
CREATE INDEX "ServiceOrder_company_id_entry_date_idx" ON "ServiceOrder"("company_id", "entry_date");

-- CreateIndex
CREATE INDEX "ServiceOrder_client_id_idx" ON "ServiceOrder"("client_id");

-- CreateIndex
CREATE INDEX "ServiceOrder_vehicle_id_idx" ON "ServiceOrder"("vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceOrder_company_id_order_number_key" ON "ServiceOrder"("company_id", "order_number");

-- CreateIndex
CREATE INDEX "Quote_company_id_idx" ON "Quote"("company_id");

-- CreateIndex
CREATE INDEX "Quote_company_id_status_idx" ON "Quote"("company_id", "status");

-- CreateIndex
CREATE INDEX "Quote_client_id_idx" ON "Quote"("client_id");

-- CreateIndex
CREATE INDEX "Quote_vehicle_id_idx" ON "Quote"("vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_company_id_quote_number_key" ON "Quote"("company_id", "quote_number");

-- CreateIndex
CREATE INDEX "ServiceOrderItem_service_order_id_idx" ON "ServiceOrderItem"("service_order_id");

-- CreateIndex
CREATE INDEX "ServiceOrderItem_company_id_type_idx" ON "ServiceOrderItem"("company_id", "type");

-- CreateIndex
CREATE INDEX "QuoteItem_quote_id_idx" ON "QuoteItem"("quote_id");

-- CreateIndex
CREATE INDEX "QuoteItem_company_id_type_idx" ON "QuoteItem"("company_id", "type");

-- CreateIndex
CREATE INDEX "Note_company_id_idx" ON "Note"("company_id");

-- CreateIndex
CREATE INDEX "Note_company_id_type_idx" ON "Note"("company_id", "type");

-- CreateIndex
CREATE INDEX "Note_related_id_idx" ON "Note"("related_id");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_from_quote_id_fkey" FOREIGN KEY ("from_quote_id") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrderItem" ADD CONSTRAINT "ServiceOrderItem_service_order_id_fkey" FOREIGN KEY ("service_order_id") REFERENCES "ServiceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

