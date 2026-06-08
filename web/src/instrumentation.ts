import {parseEnv} from '@/env';

export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    parseEnv();
  }
}
