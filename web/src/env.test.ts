import {describe, expect, it} from 'vitest';
import {parseEnv} from './env';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  AUTH_SECRET: 'x'.repeat(32),
  APP_ENCRYPTION_KEY: 'a'.repeat(64), // 32 bytes hex
};

describe('parseEnv', () => {
  it('accepts valid env', () => { expect(() => parseEnv(valid)).not.toThrow(); });
  it('rejects short encryption key', () => { expect(() => parseEnv({...valid, APP_ENCRYPTION_KEY: 'ab'})).toThrow(); });
  it('rejects missing DATABASE_URL', () => { const {DATABASE_URL, ...rest} = valid; expect(() => parseEnv(rest)).toThrow(); });
});
