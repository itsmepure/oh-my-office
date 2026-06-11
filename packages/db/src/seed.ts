// @repo/db seed script — seeds platform agents, knowledge docs, and 3 templates.
// Requires: prisma db push already run, PostgreSQL via Docker up.
//
// Run: pnpm --filter @repo/db seed

import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { PrismaClient } from './generated/client.js';

const connectionString = process.env['DATABASE_URL'] ?? 'postgresql://openoffice:openoffice@localhost:5432/openoffice';
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function seed() {
  console.log('[seed] Seeding platform agents...');

  // ── Platform Agents ────────────────────────────────────────────────────
  const planner = await prisma.agent.upsert({
    where: { id: 'agent-planner-001' },
    update: {},
    create: {
      id: 'agent-planner-001',
      name: 'Planner',
      role: 'Planner',
      systemPrompt: 'You are a strategic Planner. Break down complex tasks into executable steps. Output a structured plan with clear milestones and dependencies. Be concise and actionable.',
      tools: JSON.stringify(['read_file', 'write_file', 'search']),
      modelConfig: JSON.stringify({ model: 'claude-sonnet-4-20250514', temperature: 0.3 }),
    },
  });

  const coder = await prisma.agent.upsert({
    where: { id: 'agent-coder-001' },
    update: {},
    create: {
      id: 'agent-coder-001',
      name: 'Coder',
      role: 'Coder',
      systemPrompt: 'You are an expert software engineer. Write clean, tested, production-ready code. Follow the project conventions. Include error handling and edge cases.',
      tools: JSON.stringify(['read_file', 'write_file', 'execute_command', 'search']),
      modelConfig: JSON.stringify({ model: 'claude-sonnet-4-20250514', temperature: 0.2 }),
    },
  });

  const reviewer = await prisma.agent.upsert({
    where: { id: 'agent-reviewer-001' },
    update: {},
    create: {
      id: 'agent-reviewer-001',
      name: 'Reviewer',
      role: 'Reviewer',
      systemPrompt: 'You are a meticulous Code Reviewer. Check for bugs, security issues, performance problems, and adherence to project standards. Be thorough but constructive.',
      tools: JSON.stringify(['read_file', 'search']),
      modelConfig: JSON.stringify({ model: 'claude-sonnet-4-20250514', temperature: 0.1 }),
    },
  });

  const researcher = await prisma.agent.upsert({
    where: { id: 'agent-researcher-001' },
    update: {},
    create: {
      id: 'agent-researcher-001',
      name: 'Researcher',
      role: 'Researcher',
      systemPrompt: 'You are a thorough Researcher. Gather relevant information, analyze data, and synthesize findings into structured reports. Cite sources and be objective.',
      tools: JSON.stringify(['read_file', 'search', 'web_search']),
      modelConfig: JSON.stringify({ model: 'claude-sonnet-4-20250514', temperature: 0.5 }),
    },
  });

  const writer = await prisma.agent.upsert({
    where: { id: 'agent-writer-001' },
    update: {},
    create: {
      id: 'agent-writer-001',
      name: 'Writer',
      role: 'Writer',
      systemPrompt: 'You are a skilled Content Writer. Create clear, engaging, and well-structured content. Adapt tone and style to the target audience. Proofread your work.',
      tools: JSON.stringify(['read_file', 'write_file', 'search']),
      modelConfig: JSON.stringify({ model: 'claude-sonnet-4-20250514', temperature: 0.7 }),
    },
  });

  const editor = await prisma.agent.upsert({
    where: { id: 'agent-editor-001' },
    update: {},
    create: {
      id: 'agent-editor-001',
      name: 'Editor',
      role: 'Editor',
      systemPrompt: 'You are a sharp Editor. Refine content for clarity, grammar, style, and impact. Cut unnecessary fluff. Ensure consistency and polish.',
      tools: JSON.stringify(['read_file', 'write_file']),
      modelConfig: JSON.stringify({ model: 'claude-sonnet-4-20250514', temperature: 0.3 }),
    },
  });

  console.log('[seed] Platform agents created:', [planner.name, coder.name, reviewer.name, researcher.name, writer.name, editor.name].join(', '));

  // ── Knowledge Docs ─────────────────────────────────────────────────────
  // Guard so re-seeding doesn't duplicate (KnowledgeDoc has no natural unique key).
  const existingDocs = await prisma.knowledgeDoc.count();
  if (existingDocs === 0) {
    await prisma.knowledgeDoc.createMany({
    data: [
      { agentId: planner.id, title: 'Planning Best Practices', content: 'Break tasks into atomic steps. Each step should have a clear input, output, and verification criteria. Prefer smaller, verifiable units over large, ambiguous steps.' },
      { agentId: coder.id, title: 'Code Conventions', content: 'Use TypeScript strict mode. Follow the project ESLint/Prettier config. Write tests alongside code. Handle errors explicitly. Use async/await over raw promises.' },
      { agentId: reviewer.id, title: 'Review Checklist', content: '1. Type safety (no any/ts-ignore). 2. Error handling (no empty catch). 3. Security (no secrets in code, input validation). 4. Performance (no N+1 queries). 5. Tests cover happy + error paths.' },
      { agentId: researcher.id, title: 'Research Methodology', content: '1. Define clear research questions. 2. Gather from multiple sources. 3. Verify claims. 4. Synthesize findings. 5. Cite sources with URLs.' },
      { agentId: writer.id, title: 'Style Guide', content: 'Write in active voice. Use short paragraphs. Lead with the key point. Include examples. Avoid jargon without explanation.' },
      { agentId: editor.id, title: 'Editing Standards', content: 'Check: grammar, spelling, consistency, flow, tone alignment, factual accuracy, formatting. Mark severity: blocker / major / minor / suggestion.' },
    ],
    });
    console.log('[seed] Knowledge docs created.');
  } else {
    console.log('[seed] Knowledge docs already exist, skipping.');
  }

  // ── Template 1: Dev Team ───────────────────────────────────────────────
  const devTemplate = await prisma.template.upsert({
    where: { id: 'template-dev-001' },
    update: {},
    create: {
      id: 'template-dev-001',
      name: 'Dev Team',
      description: 'A software engineering team with Planner, Coder, and Reviewer. Ideal for feature development, bug fixes, and code improvements.',
      category: 'dev',
      workflow: JSON.stringify([
        { order: 1, agentRole: 'Planner', label: 'Plan' },
        { order: 2, agentRole: 'Coder', label: 'Implement' },
        { order: 3, agentRole: 'Reviewer', label: 'Review' },
      ]),
    },
  });

  await prisma.templateAgent.createMany({
    data: [
      { templateId: devTemplate.id, agentId: planner.id, stepOrder: 1 },
      { templateId: devTemplate.id, agentId: coder.id, stepOrder: 2 },
      { templateId: devTemplate.id, agentId: reviewer.id, stepOrder: 3 },
    ],
    skipDuplicates: true,
  });
  console.log('[seed] Template: Dev Team (3 agents)');

  // ── Template 2: Research Team ───────────────────────────────────────────
  const researchTemplate = await prisma.template.upsert({
    where: { id: 'template-research-001' },
    update: {},
    create: {
      id: 'template-research-001',
      name: 'Research Team',
      description: 'A research team with Planner, Researcher, and Reviewer. Perfect for technical research, market analysis, and deep dives.',
      category: 'research',
      workflow: JSON.stringify([
        { order: 1, agentRole: 'Planner', label: 'Plan Research' },
        { order: 2, agentRole: 'Researcher', label: 'Research' },
        { order: 3, agentRole: 'Reviewer', label: 'Verify' },
      ]),
    },
  });

  await prisma.templateAgent.createMany({
    data: [
      { templateId: researchTemplate.id, agentId: planner.id, stepOrder: 1 },
      { templateId: researchTemplate.id, agentId: researcher.id, stepOrder: 2 },
      { templateId: researchTemplate.id, agentId: reviewer.id, stepOrder: 3 },
    ],
    skipDuplicates: true,
  });
  console.log('[seed] Template: Research Team (3 agents)');

  // ── Template 3: Content Team ────────────────────────────────────────────
  const contentTemplate = await prisma.template.upsert({
    where: { id: 'template-content-001' },
    update: {},
    create: {
      id: 'template-content-001',
      name: 'Content Team',
      description: 'A content creation team with Planner, Researcher, Writer, and Editor. Ideal for blog posts, documentation, and marketing content.',
      category: 'content',
      workflow: JSON.stringify([
        { order: 1, agentRole: 'Planner', label: 'Outline' },
        { order: 2, agentRole: 'Researcher', label: 'Research' },
        { order: 3, agentRole: 'Writer', label: 'Draft' },
        { order: 4, agentRole: 'Editor', label: 'Polish' },
      ]),
    },
  });

  await prisma.templateAgent.createMany({
    data: [
      { templateId: contentTemplate.id, agentId: planner.id, stepOrder: 1 },
      { templateId: contentTemplate.id, agentId: researcher.id, stepOrder: 2 },
      { templateId: contentTemplate.id, agentId: writer.id, stepOrder: 3 },
      { templateId: contentTemplate.id, agentId: editor.id, stepOrder: 4 },
    ],
    skipDuplicates: true,
  });
  console.log('[seed] Template: Content Team (4 agents)');

  // ── Demo user + office (Phase 10 — showcase the pixel office) ────────────
  // A ready-to-view demo account with a Dev Team office already created, so a
  // fresh clone can show the pixel office without manual clicking.
  // Login: demo@openoffice.local / demo1234
  const demoPasswordHash = await bcrypt.hash('demo1234', 12);
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@openoffice.local' },
    update: {},
    create: {
      id: 'user-demo-001',
      email: 'demo@openoffice.local',
      name: 'Demo User',
      passwordHash: demoPasswordHash,
    },
  });

  // Only create the demo office once (idempotent on re-seed).
  const existingDemoOffice = await prisma.office.findFirst({
    where: { id: 'office-demo-001' },
  });
  if (!existingDemoOffice) {
    // Snapshot the Dev Team template's agents (same shape the app uses).
    const devAgents = await prisma.templateAgent.findMany({
      where: { templateId: devTemplate.id },
      include: { agent: true },
      orderBy: { stepOrder: 'asc' },
    });
    const snapshotRows = devAgents.map((ta) => ({
      stepOrder: ta.stepOrder,
      agentSnapshot: JSON.stringify({
        id: ta.agent.id,
        name: ta.agent.name,
        role: ta.agent.role,
        systemPrompt: ta.agent.systemPrompt,
        tools: JSON.parse(ta.agent.tools as string),
        modelConfig: JSON.parse(ta.agent.modelConfig as string),
      }),
    }));

    await prisma.office.create({
      data: {
        id: 'office-demo-001',
        name: 'Demo Dev Team',
        templateId: devTemplate.id,
        ownerId: demoUser.id,
        workspacePath: resolve(
          process.env['WORKSPACES_ROOT'] ?? 'D:/vibecoding/openoffice/workspaces',
          'office-demo-001',
        ),
        officeAgents: { create: snapshotRows },
        memberships: { create: { userId: demoUser.id, role: 'owner' } },
      },
    });
    console.log('[seed] Demo office created: Demo Dev Team (office-demo-001)');
  } else {
    console.log('[seed] Demo office already exists, skipping.');
  }

  // ── Demo user subscription + credits (Phase M0) ──────────────────────────
  // FREE plan + 500 monthly credits (~20 tasks). Idempotent: upsert.
  const grantResetAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.subscription.upsert({
    where: { userId: demoUser.id },
    create: { userId: demoUser.id, plan: 'FREE', status: 'active' },
    update: {},
  });
  await prisma.creditBalance.upsert({
    where: { userId: demoUser.id },
    create: { userId: demoUser.id, granted: 500, purchased: 0, grantResetAt },
    update: {}, // don't clobber a real balance on re-seed
  });
  console.log('[seed] Demo user: FREE plan + 500 credits');

  // ── Verification ───────────────────────────────────────────────────────
  const templateCount = await prisma.template.count();
  const agentCount = await prisma.agent.count();
  const templates = await prisma.template.findMany({
    include: { templateAgents: { include: { agent: true } } },
  });

  console.log(`\n[seed] ✅ Done. ${templateCount} templates, ${agentCount} agents.`);
  for (const t of templates) {
    const agentNames = t.templateAgents.map(ta => ta.agent.name).join(' → ');
    console.log(`  ${t.name} (${t.category}): ${agentNames}`);
  }
}

seed()
  .catch((e) => {
    console.error('[seed] Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
