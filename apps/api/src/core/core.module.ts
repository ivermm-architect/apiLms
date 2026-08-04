import { Global, Module } from '@nestjs/common';

import { CourseOwnershipService } from './authz/course-ownership.service';
import { DatabaseModule } from './database/database.module';

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [CourseOwnershipService],
  exports: [DatabaseModule, CourseOwnershipService],
})
export class CoreModule {}
