-- CreateTable
CREATE TABLE "new_config_permissions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "role" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "tab" TEXT,
    "allowed" INTEGER
);

-- Copy data
INSERT INTO "new_config_permissions" ("id", "role", "module", "tab", "allowed")
SELECT lower(hex(randomblob(16))), "role", "module", "tab", "allowed" FROM "config_permissions";

-- Drop original table
DROP TABLE "config_permissions";

-- Rename new table
ALTER TABLE "new_config_permissions" RENAME TO "config_permissions";

-- CreateIndex
CREATE UNIQUE INDEX "config_permissions_role_module_tab_key" ON "config_permissions"("role", "module", "tab");
