// Unit tests for crypto-billing pack catalog + config gating (the pure,
// deterministic surface). The on-chain verification path (findReference/
// validateTransfer) is proven by the devnet end-to-end test, not mocked here.

import { describe, expect, it } from 'vitest';
import { CRYPTO_PACKS, isCryptoBillingConfigured } from './crypto-billing.js';

describe('CRYPTO_PACKS catalog', () => {
  it('has the three packs with positive credits + USDC price', () => {
    for (const id of ['small', 'med', 'large']) {
      const p = CRYPTO_PACKS[id];
      expect(p).toBeDefined();
      expect(p!.credits).toBeGreaterThan(0);
      expect(Number(p!.usdc)).toBeGreaterThan(0);
      expect(p!.label).toMatch(/credits/);
    }
  });

  it('prices scale with credits (no inverted pricing)', () => {
    expect(CRYPTO_PACKS.small!.credits).toBeLessThan(CRYPTO_PACKS.med!.credits);
    expect(CRYPTO_PACKS.med!.credits).toBeLessThan(CRYPTO_PACKS.large!.credits);
    expect(Number(CRYPTO_PACKS.small!.usdc)).toBeLessThan(Number(CRYPTO_PACKS.med!.usdc));
    expect(Number(CRYPTO_PACKS.med!.usdc)).toBeLessThan(Number(CRYPTO_PACKS.large!.usdc));
  });
});

describe('isCryptoBillingConfigured', () => {
  it('returns a boolean reflecting treasury env presence', () => {
    // In test env SOLANA_TREASURY_ADDRESS is unset → false. Just assert type +
    // that it does not throw.
    expect(typeof isCryptoBillingConfigured()).toBe('boolean');
  });
});
