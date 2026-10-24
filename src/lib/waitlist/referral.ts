export const REFERRAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function generateReferralCode(): string {
  let code = '';
  // Rejection sampling avoids modulo bias while retaining cryptographic randomness.
  const ceiling = 256 - (256 % REFERRAL_ALPHABET.length);
  while (code.length < 8) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      if (byte < ceiling) code += REFERRAL_ALPHABET[byte % REFERRAL_ALPHABET.length];
      if (code.length === 8) break;
    }
  }
  return code;
}
