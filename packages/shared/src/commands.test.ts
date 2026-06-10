import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import {
  type Command,
  type CommandType,
  parseCommand,
  safeParseCommand,
} from './index.js';

const TS = '2026-06-09T12:00:00.000Z';

const validSamples: Record<CommandType, Command> = {
  'office.create': {
    type: 'office.create',
    ts: TS,
    templateId: 'tpl_dev',
    name: 'My Dev Office',
  },
  'task.create': {
    type: 'task.create',
    ts: TS,
    officeId: 'office_01',
    prompt: 'Refactor the auth module to use Auth.js v5.',
  },
};

describe('parseCommand — valid payloads', () => {
  for (const [commandType, sample] of Object.entries(validSamples)) {
    it(`parses ${commandType}`, () => {
      const parsed = parseCommand(sample);
      expect(parsed).toEqual(sample);
      expect(parsed.type).toBe(commandType);
    });
  }
});

describe('parseCommand — invalid payloads', () => {
  it('throws when type is unknown', () => {
    expect(() =>
      parseCommand({ ...validSamples['office.create'], type: 'office.delete' }),
    ).toThrow(ZodError);
  });

  it('throws when office.create.name is empty', () => {
    expect(() =>
      parseCommand({ ...validSamples['office.create'], name: '' }),
    ).toThrow(ZodError);
  });

  it('throws when office.create.name exceeds 120 chars', () => {
    expect(() =>
      parseCommand({
        ...validSamples['office.create'],
        name: 'x'.repeat(121),
      }),
    ).toThrow(ZodError);
  });

  it('throws when office.create.templateId is empty', () => {
    expect(() =>
      parseCommand({ ...validSamples['office.create'], templateId: '' }),
    ).toThrow(ZodError);
  });

  it('throws when task.create.prompt is empty', () => {
    expect(() =>
      parseCommand({ ...validSamples['task.create'], prompt: '' }),
    ).toThrow(ZodError);
  });

  it('throws when task.create.officeId is missing', () => {
    const { officeId: _omit, ...rest } = validSamples['task.create'];
    expect(() => parseCommand(rest)).toThrow(ZodError);
  });

  it('throws when ts is malformed', () => {
    expect(() =>
      parseCommand({ ...validSamples['task.create'], ts: 'not-a-date' }),
    ).toThrow(ZodError);
  });
});

describe('safeParseCommand', () => {
  it('returns success=true on valid input', () => {
    const result = safeParseCommand(validSamples['office.create']);
    expect(result.success).toBe(true);
  });

  it('returns success=false on invalid input', () => {
    const result = safeParseCommand({ type: 'task.create' });
    expect(result.success).toBe(false);
  });
});
