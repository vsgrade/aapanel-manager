import 'server-only';
import {decryptSecret} from '@/lib/crypto/secret-box';
import {getEncryptionKey} from '@/lib/config/secrets';
import {AaPanelClient} from './client';

export interface ServerCreds {
  baseUrl: string;
  apiSkEnc: string;
  insecureTLS: boolean;
}

/** Builds a client for a stored server by decrypting its api_sk (server-only). */
export function createClientForServer(server: ServerCreds): AaPanelClient {
  const apiSk = decryptSecret(server.apiSkEnc, getEncryptionKey());
  return new AaPanelClient({baseUrl: server.baseUrl, apiSk, insecureTLS: server.insecureTLS});
}

export {AaPanelClient} from './client';
export {AaPanelError} from './types';
export type {SystemTotal, AaPanelErrorKind} from './types';
