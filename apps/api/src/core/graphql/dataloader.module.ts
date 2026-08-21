import { Module } from '@nestjs/common';

import { LoadersFactory } from './loaders/loaders.factory';

/**
 * Provee la fábrica de DataLoaders para inyectarla en el `context` de GraphQL.
 * DATABASE es @Global, así que no hace falta importar DatabaseModule aquí.
 */
@Module({
  providers: [LoadersFactory],
  exports: [LoadersFactory],
})
export class DataloaderModule {}
