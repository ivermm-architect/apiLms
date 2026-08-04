import { JwtPayload } from '@cieba/shared';

export const TOKEN_PORT = Symbol('TOKEN_PORT');

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface TokenPort {
  signAccess(payload: JwtPayload): string;
  signRefresh(payload: JwtPayload): string;
  verifyAccess(token: string): JwtPayload;
  verifyRefresh(token: string): JwtPayload;
  generatePair(payload: JwtPayload): TokenPair;
}
