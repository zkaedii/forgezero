import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateKickoffPrompt } from '../src/kickoff/prompt.js';

describe('Kickoff Prompt Template', () => {
  const testUuid = 'TEST-UUID';
  const goldenPath = join(__dirname, 'fixtures', 'kickoff-prompt.golden.txt');

  it('matches the golden fixture with UUID substituted', () => {
    const output = generateKickoffPrompt(testUuid);
    const golden = readFileSync(goldenPath, 'utf-8');
    expect(output).toBe(golden);
  });

  it('contains the literal opening line with UUID', () => {
    const uuid = 'abc-123-def';
    const output = generateKickoffPrompt(uuid);
    expect(output).toContain(`[FORGEZERO KICKOFF — session ${uuid}]`);
  });

  it('contains the literal closing line', () => {
    const output = generateKickoffPrompt('any-uuid');
    expect(output).toContain('[END KICKOFF]');
  });

  it('contains all required clauses from spec §8', () => {
    const output = generateKickoffPrompt('any-uuid');
    expect(output).toContain('BEFORE any other tool calls');
    expect(output).toContain('STOP');
    expect(output).toContain('Do not improvise');
    // This clause spans two lines in the template
    expect(output).toContain('Do not list');
    expect(output).toContain('skills from memory');
    expect(output).toContain('ForgeZero kickoff dump written:');
  });
});
