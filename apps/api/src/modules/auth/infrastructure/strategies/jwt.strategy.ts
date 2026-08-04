import { JwtPayload } from '@cieba/shared';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import {
  REFRESH_TOKEN_REPOSITORY,
  RefreshTokenRepository,
} from '../../domain/ports/refresh-token.repository';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokens: RefreshTokenRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (!payload?.sub) throw new UnauthorizedException('Invalid token payload');

    // Si el token trae sessionId, exigir que la sesión siga vigente en DB.
    // Así, revocar una sesión invalida su access token en el siguiente request
    // (logout real), sin dejar de ser stateless para tokens legacy sin sessionId.
    if (payload.sessionId) {
      const active = await this.refreshTokens.isSessionActive(payload.sessionId);
      if (!active) throw new UnauthorizedException('Sesión finalizada');
    }

    return payload;
  }
}
