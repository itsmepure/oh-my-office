// Setup SQLite database with better-sqlite3
// This script creates the database and runs the Prisma-generated migration SQL.
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(__dirname, '..', 'dev.db');

console.log(`Creating database at: ${dbPath}`);
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Run schema creation based on our Prisma models
// Since prisma db push is broken on this setup, we create tables manually
db.exec(`
  CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

  CREATE TABLE IF NOT EXISTS "Agent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "tools" TEXT NOT NULL DEFAULT '[]',
    "modelConfig" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
  );

  CREATE INDEX IF NOT EXISTS "Agent_ownerId_idx" ON "Agent"("ownerId");
  CREATE INDEX IF NOT EXISTS "Agent_role_idx" ON "Agent"("role");

  CREATE TABLE IF NOT EXISTS "KnowledgeDoc" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "fileRef" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE
  );

  CREATE INDEX IF NOT EXISTS "KnowledgeDoc_agentId_idx" ON "KnowledgeDoc"("agentId");

  CREATE TABLE IF NOT EXISTS "Template" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "workflow" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS "Template_category_idx" ON "Template"("category");

  CREATE TABLE IF NOT EXISTS "TemplateAgent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE
  );

  CREATE UNIQUE INDEX IF NOT EXISTS "TemplateAgent_templateId_stepOrder_key" ON "TemplateAgent"("templateId", "stepOrder");
  CREATE INDEX IF NOT EXISTS "TemplateAgent_templateId_idx" ON "TemplateAgent"("templateId");
  CREATE INDEX IF NOT EXISTS "TemplateAgent_agentId_idx" ON "TemplateAgent"("agentId");

  CREATE TABLE IF NOT EXISTS "Office" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "workspacePath" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
  );

  CREATE INDEX IF NOT EXISTS "Office_ownerId_idx" ON "Office"("ownerId");
  CREATE INDEX IF NOT EXISTS "Office_templateId_idx" ON "Office"("templateId");

  CREATE TABLE IF NOT EXISTS "OfficeMembership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "officeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
  );

  CREATE UNIQUE INDEX IF NOT EXISTS "OfficeMembership_officeId_userId_key" ON "OfficeMembership"("officeId", "userId");
  CREATE INDEX IF NOT EXISTS "OfficeMembership_userId_idx" ON "OfficeMembership"("userId");

  CREATE TABLE IF NOT EXISTS "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "officeId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE
  );

  CREATE INDEX IF NOT EXISTS "Task_officeId_idx" ON "Task"("officeId");
  CREATE INDEX IF NOT EXISTS "Task_status_idx" ON "Task"("status");
`);

console.log('Database schema created successfully.');
console.log('Tables:', db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name));
db.close();
