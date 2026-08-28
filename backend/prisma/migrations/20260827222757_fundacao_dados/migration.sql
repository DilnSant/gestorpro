-- CreateTable
CREATE TABLE "ServiceOrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "company_id" TEXT NOT NULL,
    "service_order_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" REAL NOT NULL DEFAULT 1,
    "unit_price_cents" INTEGER NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceOrderItem_service_order_id_fkey" FOREIGN KEY ("service_order_id") REFERENCES "ServiceOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuoteItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "company_id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" REAL NOT NULL DEFAULT 1,
    "unit_price_cents" INTEGER NOT NULL,
    "total_cents" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuoteItem_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "Quote" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cpf_cnpj" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Client_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Client" ("address", "company_id", "cpf_cnpj", "createdAt", "email", "id", "name", "notes", "phone", "updatedAt") SELECT "address", "company_id", "cpf_cnpj", "createdAt", "email", "id", "name", "notes", "phone", "updatedAt" FROM "Client";
DROP TABLE "Client";
ALTER TABLE "new_Client" RENAME TO "Client";
CREATE INDEX "Client_company_id_idx" ON "Client"("company_id");
CREATE INDEX "Client_company_id_name_idx" ON "Client"("company_id", "name");
CREATE UNIQUE INDEX "Client_company_id_cpf_cnpj_key" ON "Client"("company_id", "cpf_cnpj");
CREATE TABLE "new_Note" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "company_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "type" TEXT NOT NULL DEFAULT 'general',
    "related_id" TEXT,
    "file_urls" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Note_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Note" ("company_id", "content", "createdAt", "file_urls", "id", "related_id", "title", "type", "updatedAt") SELECT "company_id", "content", "createdAt", "file_urls", "id", "related_id", "title", "type", "updatedAt" FROM "Note";
DROP TABLE "Note";
ALTER TABLE "new_Note" RENAME TO "Note";
CREATE INDEX "Note_company_id_idx" ON "Note"("company_id");
CREATE INDEX "Note_company_id_type_idx" ON "Note"("company_id", "type");
CREATE INDEX "Note_related_id_idx" ON "Note"("related_id");
CREATE TABLE "new_Quote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "company_id" TEXT NOT NULL,
    "quote_number" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "client_name_snapshot" TEXT NOT NULL,
    "vehicle_plate_snapshot" TEXT NOT NULL,
    "vehicle_desc_snapshot" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "valid_until" DATETIME,
    "description" TEXT,
    "notes" TEXT,
    "labor_total_cents" INTEGER NOT NULL DEFAULT 0,
    "parts_total_cents" INTEGER NOT NULL DEFAULT 0,
    "discount_cents" INTEGER NOT NULL DEFAULT 0,
    "total_amount_cents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Quote_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Quote_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Quote_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "Vehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Quote" ("client_id", "company_id", "createdAt", "description", "id", "notes", "quote_number", "status", "updatedAt", "valid_until", "vehicle_id") SELECT "client_id", "company_id", "createdAt", "description", "id", "notes", "quote_number", "status", "updatedAt", "valid_until", "vehicle_id" FROM "Quote";
DROP TABLE "Quote";
ALTER TABLE "new_Quote" RENAME TO "Quote";
CREATE INDEX "Quote_company_id_idx" ON "Quote"("company_id");
CREATE INDEX "Quote_company_id_status_idx" ON "Quote"("company_id", "status");
CREATE INDEX "Quote_client_id_idx" ON "Quote"("client_id");
CREATE INDEX "Quote_vehicle_id_idx" ON "Quote"("vehicle_id");
CREATE UNIQUE INDEX "Quote_company_id_quote_number_key" ON "Quote"("company_id", "quote_number");
CREATE TABLE "new_ServiceOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "company_id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "client_name_snapshot" TEXT NOT NULL,
    "vehicle_plate_snapshot" TEXT NOT NULL,
    "vehicle_desc_snapshot" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "entry_date" DATETIME,
    "estimated_date" DATETIME,
    "completion_date" DATETIME,
    "description" TEXT,
    "notes" TEXT,
    "labor_total_cents" INTEGER NOT NULL DEFAULT 0,
    "parts_total_cents" INTEGER NOT NULL DEFAULT 0,
    "discount_cents" INTEGER NOT NULL DEFAULT 0,
    "total_amount_cents" INTEGER NOT NULL DEFAULT 0,
    "from_quote_id" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ServiceOrder_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ServiceOrder_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ServiceOrder_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "Vehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ServiceOrder_from_quote_id_fkey" FOREIGN KEY ("from_quote_id") REFERENCES "Quote" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ServiceOrder" ("client_id", "company_id", "completion_date", "createdAt", "description", "entry_date", "estimated_date", "from_quote_id", "id", "notes", "order_number", "status", "updatedAt", "vehicle_id") SELECT "client_id", "company_id", "completion_date", "createdAt", "description", "entry_date", "estimated_date", "from_quote_id", "id", "notes", "order_number", "status", "updatedAt", "vehicle_id" FROM "ServiceOrder";
DROP TABLE "ServiceOrder";
ALTER TABLE "new_ServiceOrder" RENAME TO "ServiceOrder";
CREATE UNIQUE INDEX "ServiceOrder_from_quote_id_key" ON "ServiceOrder"("from_quote_id");
CREATE INDEX "ServiceOrder_company_id_idx" ON "ServiceOrder"("company_id");
CREATE INDEX "ServiceOrder_company_id_status_idx" ON "ServiceOrder"("company_id", "status");
CREATE INDEX "ServiceOrder_company_id_entry_date_idx" ON "ServiceOrder"("company_id", "entry_date");
CREATE INDEX "ServiceOrder_client_id_idx" ON "ServiceOrder"("client_id");
CREATE INDEX "ServiceOrder_vehicle_id_idx" ON "ServiceOrder"("vehicle_id");
CREATE UNIQUE INDEX "ServiceOrder_company_id_order_number_key" ON "ServiceOrder"("company_id", "order_number");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'owner',
    "company_id" TEXT,
    "password_changed_at" DATETIME,
    "last_login_at" DATETIME,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_User" ("company_id", "createdAt", "email", "id", "name", "password", "role", "updatedAt") SELECT "company_id", "createdAt", "email", "id", "name", "password", "role", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_company_id_idx" ON "User"("company_id");
CREATE TABLE "new_Vehicle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "company_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "year" INTEGER,
    "color" TEXT,
    "km" INTEGER,
    "chassis" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Vehicle_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Vehicle_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Vehicle" ("brand", "chassis", "client_id", "color", "company_id", "createdAt", "id", "km", "model", "plate", "updatedAt", "year") SELECT "brand", "chassis", "client_id", "color", "company_id", "createdAt", "id", "km", "model", "plate", "updatedAt", "year" FROM "Vehicle";
DROP TABLE "Vehicle";
ALTER TABLE "new_Vehicle" RENAME TO "Vehicle";
CREATE INDEX "Vehicle_company_id_idx" ON "Vehicle"("company_id");
CREATE INDEX "Vehicle_client_id_idx" ON "Vehicle"("client_id");
CREATE UNIQUE INDEX "Vehicle_company_id_plate_key" ON "Vehicle"("company_id", "plate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ServiceOrderItem_service_order_id_idx" ON "ServiceOrderItem"("service_order_id");

-- CreateIndex
CREATE INDEX "ServiceOrderItem_company_id_type_idx" ON "ServiceOrderItem"("company_id", "type");

-- CreateIndex
CREATE INDEX "QuoteItem_quote_id_idx" ON "QuoteItem"("quote_id");

-- CreateIndex
CREATE INDEX "QuoteItem_company_id_type_idx" ON "QuoteItem"("company_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Company_cnpj_key" ON "Company"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "Company_domain_key" ON "Company"("domain");

