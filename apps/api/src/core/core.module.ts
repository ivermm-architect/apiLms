import { Global, Module } from '@nestjs/common';

import { AiWarmupService } from './ai/ai-warmup.service';
import { CourseOwnershipService } from './authz/course-ownership.service';
import { DatabaseModule } from './database/database.module';

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [CourseOwnershipService, AiWarmupService],
  exports: [DatabaseModule, CourseOwnershipService],
})
export class CoreModule {}
