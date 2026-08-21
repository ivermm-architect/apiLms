import { Database } from '@cieba/db';
import { Inject, Injectable } from '@nestjs/common';
import DataLoader from 'dataloader';

import { DATABASE } from '../../database/database.module';

import { createUserRolesLoader } from './user-roles.loader';

/** Conjunto de DataLoaders vivos durante una única petición GraphQL. */
export interface AppLoaders {
  /** userId → nombres de rol (batch + cache por petición). */
  userRoles: DataLoader<string, string[]>;
}

/** Forma del `context` GraphQL que exponemos a los resolvers. */
export interface GqlContext {
  req: unknown;
  res: unknown;
  loaders: AppLoaders;
}

/**
 * Crea un juego NUEVO de loaders por cada petición. Nunca compartir loaders
 * entre peticiones: su caché es intencionadamente de vida corta (una request)
 * para evitar servir datos obsoletos o cruzar información entre usuarios.
 */
@Injectable()
export class LoadersFactory {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  create(): AppLoaders {
    return {
      userRoles: createUserRolesLoader(this.db),
    };
  }
}
