# CRYPTO_BILLING.md — USDC on Solana (credit packs)

Status: DRAFT v1 (2026-06-11). Pairs with MONETIZATION.md. Decision: Option A
(crypto for one-time CREDIT PACKS only; subscriptions stay card/Lemon or
deferred) + DIY Solana Pay + Helius RPC + devnet first.

## 1. Why this fits

Credit packs are one-time prepaid purchases (pay X → get Y credits). Crypto is
ideal for one-time payments. Recurring subscriptions do NOT exist on-chain, so
we deliberately scope crypto to packs only. The existing idempotent
`fulfillCreditPack(userId, credits, orderRef)` is reused with the on-chain tx
signature as `orderRef` → replay-safe by construction.

## 2. Payment flow (Solana Pay, DIY)

```
1. User clicks "Buy 5,000 credits with USDC".
2. Backend creates a CryptoPayment row:
     - reference: a fresh random Solana PublicKey (unique per payment)
     - userId, credits, expectedAmount (USDC), status='pending'
3. Backend returns a Solana Pay URL/QR:
     solana:<TREASURY>?amount=<usdc>&spl-token=<USDC_MINT>&reference=<reference>&label=OpenOffice&message=...
4. User pays from any Solana wallet (Phantom, etc.). The `reference` pubkey is
   attached to the transfer (read-only key) so we can find the tx without
   trusting the client.
5. Client polls GET /api/billing/crypto/status?reference=...
6. Backend verifies ON-CHAIN (never trusts the client):
     a. findReference(connection, reference) → tx signature (finalized)
     b. validateTransfer(connection, signature, { recipient: TREASURY,
        amount: expectedAmount, splToken: USDC_MINT, reference })
     c. status must be finalized
7. On valid + not-yet-settled: fulfillCreditPack(userId, credits, signature).
   Mark CryptoPayment status='confirmed', store txSignature (unique).
8. Idempotent: signature is unique + fulfillCreditPack guards by orderRef.
```

## 3. Security checklist (CRITICAL — wrong = free credits)

Every one of these MUST hold before crediting:
- [ ] Recipient is OUR treasury address (validateTransfer recipient).
- [ ] SPL token mint == USDC_MINT for the active network (not a fake token).
- [ ] Amount >= expectedAmount (exact, in base units; USDC = 6 decimals).
- [ ] The `reference` pubkey is present in the tx (findReference).
- [ ] Tx is `finalized` (not just confirmed) before crediting.
- [ ] txSignature has not already been used (DB unique + fulfillCreditPack
      orderRef guard). Double-submit → no double credit.
- [ ] The CryptoPayment row belongs to the authenticated user (tenant scope).
- [ ] Amounts compared as integers (base units) — never floats.
- [ ] Expired pending payments (> 30 min) are not creditable.

## 4. Data model (Prisma addition)

```prisma
model CryptoPayment {
  id             String   @id @default(uuid())
  userId         String
  reference      String   @unique   // base58 Solana pubkey used as the on-chain reference
  credits        Int                 // credits to grant on confirmation
  expectedAmount String              // USDC amount as a decimal string (e.g. "20")
  status         String   @default("pending") // pending | confirmed | expired | failed
  txSignature    String?  @unique    // set once verified
  network        String   @default("devnet")  // devnet | mainnet-beta
  createdAt      DateTime @default(now())
  confirmedAt    DateTime?
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@index([status])
}
```
User gains `cryptoPayments CryptoPayment[]`.

## 5. Pack catalog (server-side, source of truth)

Mirror MONETIZATION packs; price in USDC == USD:
```
PACK_SMALL  : 1,000 credits  = 5 USDC
PACK_MED    : 5,000 credits  = 20 USDC
PACK_LARGE  : 15,000 credits = 50 USDC
```
The client only sends a pack id; the server sets credits + expectedAmount.
NEVER trust client-sent amounts/credits.

## 6. Env

```
SOLANA_NETWORK=devnet                 # devnet | mainnet-beta
SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=...   # Helius
SOLANA_TREASURY_ADDRESS=<our receiving wallet pubkey>
# USDC mint per network:
#   mainnet: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
#   devnet : 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU  (common devnet USDC)
USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
```

Treasury private key is NOT needed (we only receive). We only store the public
address. Keep any keypair used for devnet testing OUT of the repo.

## 7. Build order

M-crypto-1: deps + schema + db push
M-crypto-2: lib (reference gen, URL build, verify) + unit tests (mocked conn)
M-crypto-3: API (create + status) + reuse fulfillCreditPack
M-crypto-4: Settings UI (pick pack → QR/deeplink → poll → success)
M-crypto-5: devnet treasury + end-to-end real devnet transfer test
M-crypto-6: gate + deploy (devnet mode), then later flip env to mainnet

## 8. Mainnet cutover (later)

- Set SOLANA_NETWORK=mainnet-beta, USDC_MINT=EPjF..., SOLANA_RPC_URL=mainnet
  Helius, SOLANA_TREASURY_ADDRESS=real wallet.
- Re-verify the security checklist against mainnet.
- Tax note: no merchant-of-record — VAT/sales-tax handling is the operator's
  responsibility (documented trade-off vs Lemon Squeezy).

## 9. Verification status (as of devnet deploy)

VERIFIED:
- Build + gate green; unit tests (pack catalog + config gating).
- Live on VPS (devnet): POST /api/billing/crypto returns a valid Solana Pay URL
  (correct treasury, amount, devnet USDC mint, unique reference); status poll
  returns "pending".
- On-chain verify logic written per the §3 security checklist
  (findReference + validateTransfer: recipient/mint/amount/finalized + dedupe).

NOT YET VERIFIED (deferred by decision):
- A real on-chain USDC transfer crediting the account. Devnet faucet was dry /
  rate-limited (public RPC 429, Helius needs a key). Decision: defer the live
  transfer test to mainnet cutover — mainnet uses REAL USDC, so no faucet is
  needed. At cutover, run one small real purchase end-to-end and confirm the
  credit lands before announcing crypto billing.

CUTOVER CHECKLIST (do before relying on crypto in prod):
- [ ] Set mainnet env (network, mint, RPC with Helius key, real treasury).
- [ ] Make ONE small real USDC purchase → confirm CryptoPayment.status=confirmed
      + credits granted + ledger row (reason=purchase, agentRef=order:<sig>).
- [ ] Confirm a replay of the same signature does NOT double-credit.
- [ ] Confirm a wrong-amount / wrong-mint transfer is rejected (status=failed).
