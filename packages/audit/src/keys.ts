import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as nodeSign,
  verify as nodeVerify,
} from 'node:crypto';

/**
 * Ed25519 via Node's built-in crypto. No third-party dependency, therefore no
 * supply-chain surface on the one primitive the whole authorization model rests
 * on.
 */
export interface KeyPairPem {
  publicKeyPem: string;
  privateKeyPem: string;
}

export function generateApproverKeyPair(): KeyPairPem {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

/** Detached Ed25519 signature over a UTF-8 message, base64. */
export function signMessage(message: string, privateKeyPem: string): string {
  const key = createPrivateKey(privateKeyPem);
  return nodeSign(null, Buffer.from(message, 'utf8'), key).toString('base64');
}

/**
 * Verify a detached signature. Returns false rather than throwing on malformed
 * keys or signatures: a corrupt approval is a policy refusal, not a crash.
 */
export function verifyMessage(
  message: string,
  signatureB64: string,
  publicKeyPem: string,
): boolean {
  try {
    const key = createPublicKey(publicKeyPem);
    return nodeVerify(null, Buffer.from(message, 'utf8'), key, Buffer.from(signatureB64, 'base64'));
  } catch {
    return false;
  }
}
