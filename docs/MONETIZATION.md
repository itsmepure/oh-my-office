# MONETIZATION.md — OpenOffice

Status: DRAFT v1 (2026-06-11). Owner: itsmepure.

---

## 1. Core Principle

> **Subscription unlocks capability. Credits pay for OUR agents' compute.
> Bring-your-own-key (BYOK) or your-own-agents cost zero credits.**

Tasks are **unlimited** for everyone. We never cap how many times a user runs
their office. The only metered resource is **compute spent by platform-provided
agents running on our LLM key**.

### Why this model

- Our only real variable cost is **LLM tokens**. Tasks that run on a user's own
  key (BYOK) or that only use the user's own custom agents cost us nothing →
  they must NOT burn credits.
- Tasks that use **our built-in agents** (Planner, Coder, Reviewer, Editor,
  Researcher, Writer — `ownerId = null`) run on **our** LLM key → those burn
  credits, priced with a safe markup over token cost.
- This makes "unlimited tasks" honest: the user is never blocked from running,
  they just need credits (or their own key) to use *our* agents.

---

## 2. The Credit Rule (exact)

A single task runs an ordered pipeline of agents. For **each agent step**:

```
if step.agent.ownerId == null  AND  office is using the PLATFORM LLM key:
    → bill credits for that step (based on tokens used)
else (user-owned agent, OR office configured with BYOK key):
    → 0 credits
```

So credits are charged **per platform-agent step**, not per task. A task that
mixes our agents + the user's own agents only bills for the platform-agent
steps. A task on a BYOK office bills nothing.

### Credit math (target)

- Reference: 1 typical task (3 platform agents, tool loop) ≈ 50k–200k tokens
  ≈ **$0.02–0.10** raw DeepSeek cost.
- **500 free credits ≈ 20 tasks → ~25 credits/task.**
- So **1 credit ≈ 1/25 of an average task ≈ ~6k tokens of platform-agent work.**
- Internal billing formula (tunable, lives in config):

  ```
  credits_for_step = ceil( (input_tokens + output_tokens) / TOKENS_PER_CREDIT )
  TOKENS_PER_CREDIT = 6000   # tune so avg task ≈ 25 credits
  ```

- Pricing of paid credit packs targets a **3–5× markup** over raw token cost,
  which is still cheap in absolute terms because DeepSeek is cheap.

> User-facing language: show **credits**, not tokens. "This task used 23
> credits." Keep tokens internal.

---

## 3. Tiers

| | FREE | PRO ($15/mo) | TEAM ($49/mo base) |
|---|---|---|---|
| Price | $0 | $15/mo ($12/mo annual) | $49/mo + ~$15/seat |
| Offices | 2 | Unlimited | Unlimited |
| Use built-in agents | ✅ (costs credits) | ✅ (costs credits) | ✅ (costs credits) |
| Bring your own agents | ✅ | ✅ | ✅ |
| Agent builder (full) | basic | ✅ full + knowledge docs | ✅ |
| Templates | 3 seeds | all | all |
| Monthly credit grant | **500** (~20 tasks) | **5,000** (~200 tasks) | **20,000 pooled** (~800 tasks) |
| Tasks | Unlimited | Unlimited | Unlimited |
| BYOK (zero credits) | ✅ | ✅ | ✅ org-level |
| Pixel office + live feed | ✅ full | ✅ | ✅ |
| Multi-member / shared office | ❌ | ❌ | ✅ |
| Priority queue | ❌ | normal | ✅ priority |
| Seats | 1 | 1 | per-seat |

Notes:
- **Pixel office is never paywalled** — it's the signature/viral hook. Monetize
  capacity (offices, credits, seats, priority), never the visualization.
- **BYOK escapes credits entirely** on every tier — the headline for indie devs:
  *"Bring your own key = run our agents for free, forever."*
- Credit grants **refresh monthly** and **do not roll over** (keeps it simple;
  revisit later). Purchased credit packs (overage) **do not expire**.

---

## 4. Credit Packs (overage / top-up)

When monthly grant runs out, the user can either (a) attach a BYOK key (free
from then on), or (b) buy a credit pack:

| Pack | Credits | Price | ≈ tasks |
|---|---|---|---|
| Small | 1,000 | $5 | ~40 |
| Medium | 5,000 | $20 | ~200 |
| Large | 15,000 | $50 | ~600 |

Packs are top-ups on top of the subscription grant; purchased credits are
consumed only after the monthly grant is exhausted.

---

## 5. Anti-abuse / margin guards

1. **Free tier**: 500 credits/mo on our key. Beyond that → BYOK or buy a pack.
   No way to burn unlimited platform compute for free.
2. **Hard stop at 0 credits** (platform key): a task that would invoke a
   platform agent with insufficient credits is rejected *before* the LLM call,
   with a clear message ("Out of credits — add a key or top up"). Never go
   negative.
3. **Per-step pre-check**: estimate worst-case step cost; if remaining credits
   can't cover the *minimum* step, block early.
4. **BYOK keys are encrypted at rest** (see schema). Never sent to the browser.
5. **Reserve + settle** pattern: reserve an estimate before a step, settle to
   actual token usage after. Prevents overspend on concurrent tasks.

---

## 6. Data model (Prisma additions)

```prisma
enum Plan { FREE PRO TEAM }

model Subscription {
  id            String   @id @default(uuid())
  userId        String   @unique            // owner; Team links members via OfficeMembership
  plan          Plan     @default(FREE)
  status        String   @default("active") // active | past_due | canceled
  stripeCustomerId    String?
  stripeSubscriptionId String?
  currentPeriodEnd    DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model CreditBalance {
  id            String   @id @default(uuid())
  userId        String   @unique
  granted       Int      @default(0)   // monthly grant remaining
  purchased     Int      @default(0)   // bought packs (consumed after grant)
  grantResetAt  DateTime                // when granted refills
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

// Append-only audit of every credit movement. Source of truth for balance is
// CreditBalance; this is the ledger for history/debugging/disputes.
model CreditLedger {
  id          String   @id @default(uuid())
  userId      String
  delta       Int                       // negative = spend, positive = grant/purchase
  reason      String                    // "task_step" | "monthly_grant" | "purchase" | "refund"
  taskId      String?
  agentRef    String?                   // which platform agent step
  inputTokens Int?
  outputTokens Int?
  createdAt   DateTime @default(now())
  @@index([userId, createdAt])
}

// BYOK: a user/office can attach their own LLM key. Encrypted at rest.
model LlmKey {
  id          String   @id @default(uuid())
  userId      String
  officeId    String?                   // null = account-default; set = office override
  provider    String   @default("deepseek")
  baseUrl     String?
  model       String?
  ciphertext  String                    // AES-GCM encrypted key
  iv          String
  createdAt   DateTime @default(now())
  @@index([userId])
}
```

Office gains an effective-key resolution: **office BYOK key → account BYOK key →
platform key (bills credits)**.

Task/queue gains a `priority Int @default(0)` column; Team offices enqueue at
higher priority (orchestrator `dequeueTask` orders by priority then createdAt).

---

## 7. Billing provider

Start with **Lemon Squeezy** (merchant-of-record: handles global VAT/sales tax,
easy for a solo indie, no business entity gymnastics). Migrate to Stripe later
if volume justifies it. Both via webhooks → update `Subscription` + grant credits.

### Required env (web + webhook)

```
# Webhook signature (Lemon Squeezy → /api/billing/webhook)
LEMON_WEBHOOK_SECRET=<signing secret>

# Variant ids → plan / pack mapping (from your Lemon store products)
LEMON_VARIANT_PRO=<variant id>
LEMON_VARIANT_TEAM=<variant id>
LEMON_VARIANT_PACK_SMALL=<variant id>   # 1,000 credits
LEMON_VARIANT_PACK_MED=<variant id>     # 5,000 credits
LEMON_VARIANT_PACK_LARGE=<variant id>   # 15,000 credits

# Checkout URLs (product checkout links). The app appends
# ?checkout[custom][user_id]=<id>&checkout[email]=<email> so the webhook can
# match the user reliably (not just by email).
LEMON_CHECKOUT_PRO=<checkout url>
LEMON_CHECKOUT_TEAM=<checkout url>
LEMON_CHECKOUT_PACK_SMALL=<checkout url>
LEMON_CHECKOUT_PACK_MED=<checkout url>
LEMON_CHECKOUT_PACK_LARGE=<checkout url>

# Customer portal (manage/cancel subscription)
LEMON_PORTAL_URL=<portal url>
```

Without these, billing is dormant: the webhook returns 503, and upgrade / buy
buttons are hidden. The rest of the app works normally (FREE tier).

---

## 8. Non-negotiables carried over

- LLM keys (ours AND user BYOK) live server-side only; never shipped to browser.
- All credit mutations go through one server module (`packages/db/src/credits.ts`)
  with the reserve→settle pattern, inside a transaction. No ad-hoc balance edits.
- Multi-tenant: credit balance + keys scoped per user; Team pools at the org
  owner. A user never sees another tenant's balance/keys.
