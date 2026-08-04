import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';

import { HasherPort } from '../domain/ports/hasher.port';

@Injectable()
export class BcryptHasherService implements HasherPort {
  private readonly rounds: number;

  constructor(config: ConfigService) {
    this.rounds = config.get<number>('BCRYPT_ROUNDS', 10);
  }

  async hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.rounds);
  }

  async compare(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
