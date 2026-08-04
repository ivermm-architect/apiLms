import { createDatabase, Database } from '@cieba/db';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

export const DATABASE = Symbol('DATABASE');
export type DatabaseToken = Database;

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: DATABASE,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Database => {
        const url = config.getOrThrow<string>('DATABASE_URL');
        return createDatabase(url);
      },
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule {}
