import { JwtPayload } from '@cieba/shared';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { TokenPair, TokenPort } from '../domain/ports/token.port';

@Injectable()
export class JwtTokenService implements TokenPort {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  signAccess(payload: JwtPayload): string {
    return this.jwt.sign(payload, {
      secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN', '15m'),
    });
  }

  signRefresh(payload: JwtPayload): string {
    return this.jwt.sign(payload, {
      secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
    });
  }

  verifyAccess(token: string): JwtPayload {
    return this.jwt.verify<JwtPayload>(token, {
      secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
    });
  }

  verifyRefresh(token: string): JwtPayload {
    return this.jwt.verify<JwtPayload>(token, {
      secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
    });
  }

  generatePair(payload: JwtPayload): TokenPair {
    const accessToken = this.signAccess(payload);
    const refreshToken = this.signRefresh(payload);
    const expiresIn = this.parseExpiry(this.config.get('JWT_ACCESS_EXPIRES_IN', '15m'));
    return { accessToken, refreshToken, expiresIn };
  }

  private parseExpiry(value: string): number {
    const m = value.match(/^(\d+)([smhd])$/);
    if (!m) return 900;
    const n = Number(m[1]);
    switch (m[2]) {
      case 's':
        return n;
      case 'm':
        return n * 60;
      case 'h':
        return n * 3600;
      case 'd':
        return n * 86400;
      default:
        return 900;
    }
  }
}
