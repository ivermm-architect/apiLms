import { randomBytes } from 'node:crypto';

import { schema, Database } from '@cieba/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { DATABASE } from '../../../core/database/database.module';

@Injectable()
export class DrizzleCertificateRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findByCode(code: string) {
    const [row] = await this.db
      .select()
      .from(schema.certificates)
      .where(eq(schema.certificates.certificateCode, code))
      .limit(1);
    return row ?? null;
  }

  async findByStudentAndCourse(studentId: string, courseId: string) {
    const [row] = await this.db
      .select()
      .from(schema.certificates)
      .where(
        and(
          eq(schema.certificates.studentId, studentId),
          eq(schema.certificates.courseId, courseId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async listByStudent(studentId: string) {
    return this.db
      .select()
      .from(schema.certificates)
      .where(eq(schema.certificates.studentId, studentId));
  }

  async issue(input: {
    studentId: string;
    courseId: string;
    enrollmentId: string;
    finalScore?: number;
  }) {
    const code = this.generateCode();
    const [row] = await this.db
      .insert(schema.certificates)
      .values({
        studentId: input.studentId,
        courseId: input.courseId,
        enrollmentId: input.enrollmentId,
        certificateCode: code,
        verificationUrl: `/certificates/verify/${code}`,
        finalScore: input.finalScore !== undefined ? String(input.finalScore) : undefined,
      })
      .returning();
    return row!;
  }

  private generateCode(): string {
    const random = randomBytes(6).toString('hex').toUpperCase();
    const year = new Date().getFullYear();
    return `CIEBA-${year}-${random}`;
  }
}
