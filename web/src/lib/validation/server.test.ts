import {describe, it, expect} from 'vitest';
import {serverCreateSchema, serverListParamsSchema} from './server';

describe('serverCreateSchema', () => {
  it('accepts a valid server and coerces insecureTLS', () => {
    const r = serverCreateSchema.safeParse({
      name: 'Prod-1', baseUrl: 'https://1.2.3.4:8888', apiSk: 'x'.repeat(16), tag: 'eu', insecureTLS: 'true',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.insecureTLS).toBe(true);
  });

  it('treats explicit "false" as false and absent as true (default on)', () => {
    const off = serverCreateSchema.safeParse({name: 'a', baseUrl: 'http://h:1', apiSk: 'x'.repeat(16), insecureTLS: 'false'});
    expect(off.success && off.data.insecureTLS).toBe(false);
    const absent = serverCreateSchema.safeParse({name: 'a', baseUrl: 'http://h:1', apiSk: 'x'.repeat(16)});
    expect(absent.success && absent.data.insecureTLS).toBe(true);
  });

  it('rejects non-http(s) URLs and short api_sk', () => {
    expect(serverCreateSchema.safeParse({name: 'a', baseUrl: 'ftp://x', apiSk: 'x'.repeat(16)}).success).toBe(false);
    expect(serverCreateSchema.safeParse({name: 'a', baseUrl: 'https://x:1', apiSk: 'short'}).success).toBe(false);
  });

  it('coerces empty tag to undefined', () => {
    const r = serverCreateSchema.safeParse({name: 'a', baseUrl: 'http://h:1', apiSk: 'x'.repeat(16), tag: ''});
    expect(r.success && r.data.tag).toBeUndefined();
  });
});

describe('serverListParamsSchema (resilient to hand-edited URLs — never throws)', () => {
  it('applies defaults on empty input', () => {
    const r = serverListParamsSchema.parse({});
    expect(r).toMatchObject({page: 1, pageSize: 25, status: 'all', sort: 'name', dir: 'asc'});
  });
  it('clamps oversized pageSize to 100', () => {
    expect(serverListParamsSchema.parse({pageSize: '999'}).pageSize).toBe(100);
  });
  it('falls back invalid enum values to defaults instead of throwing', () => {
    expect(serverListParamsSchema.parse({sort: 'pwned'}).sort).toBe('name');
    expect(serverListParamsSchema.parse({status: 'nope', dir: 'sideways'})).toMatchObject({status: 'all', dir: 'asc'});
  });
  it('tolerates duplicated params (array values) by taking the first', () => {
    expect(serverListParamsSchema.parse({status: ['online', 'offline']}).status).toBe('online');
  });
});
