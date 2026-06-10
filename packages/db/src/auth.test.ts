import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './auth.js';

describe('password hashing', () => {
  it('produces a bcrypt hash that verifies the same password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects wrong password', async () => {
    const hash = await hashPassword('hunter2');
    expect(await verifyPassword('hunter3', hash)).toBe(false);
  });

  it('returns false (does not throw) for malformed hash', async () => {
    expect(await verifyPassword('whatever', 'not-a-bcrypt-hash')).toBe(false);
  });

  it('produces different hashes for the same password (salt)', async () => {
    const a = await hashPassword('samepass');
    const b = await hashPassword('samepass');
    expect(a).not.toBe(b);
  });
});
