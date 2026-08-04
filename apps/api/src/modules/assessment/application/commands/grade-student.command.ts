import { Grade } from '@cieba/db';
import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';

import { DrizzleGradeRepository } from '../../infrastructure/drizzle-grade.repository';

export class GradeStudentCommand implements ICommand {
  constructor(
    public readonly input: {
      studentId: string;
      teacherId: string;
      courseId: string;
      enrollmentId: string;
      lessonId?: string;
      title: string;
      score: number;
      maxScore?: number;
      weight?: number;
      feedback?: string;
    },
  ) {}
}

@CommandHandler(GradeStudentCommand)
export class GradeStudentHandler implements ICommandHandler<GradeStudentCommand, Grade> {
  constructor(private readonly repo: DrizzleGradeRepository) {}

  async execute(cmd: GradeStudentCommand): Promise<Grade> {
    return this.repo.create(cmd.input);
  }
}
