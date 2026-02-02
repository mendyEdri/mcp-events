import jwt from 'jsonwebtoken';

export interface JWTManagerOptions {
  teamId: string;
  keyId: string;
  privateKey: string;
  tokenTTL?: number; // milliseconds, default 50 minutes
}

export class JWTManager {
  private cachedToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private tokenTTL: number;

  constructor(private options: JWTManagerOptions) {
    // APNS tokens are valid for 1 hour, refresh at 50 minutes
    this.tokenTTL = options.tokenTTL ?? 50 * 60 * 1000;
  }

  getToken(): string {
    const now = Date.now();

    // Return cached token if still valid
    if (this.cachedToken && now < this.tokenExpiresAt) {
      return this.cachedToken;
    }

    // Generate new token
    const issuedAt = Math.floor(now / 1000);
    const payload = {
      iss: this.options.teamId,
      iat: issuedAt,
    };

    this.cachedToken = jwt.sign(payload, this.options.privateKey, {
      algorithm: 'ES256',
      header: {
        alg: 'ES256',
        kid: this.options.keyId,
      },
    });

    this.tokenExpiresAt = now + this.tokenTTL;
    return this.cachedToken;
  }

  invalidate(): void {
    this.cachedToken = null;
    this.tokenExpiresAt = 0;
  }
}
