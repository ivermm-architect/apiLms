import { Course } from '@cieba/db';
import { describe, expect, it, vi } from 'vitest';

import {
  EntityNotFoundException,
  ForbiddenDomainException,
} from '../../../../shared/exceptions/domain.exception';
import { CourseRepository } from '../../domain/ports/course.repository';

import { UpdateCourseCommand, UpdateCourseHandler } from './update-course.command';

const COURSE = { id: 'c-1', instructorId: 'teacher-1', title: 'Original' } as Course;

function buildHandler(course: Course | null) {
  const repo = {
    findById: vi.fn().mockResolvedValue(course),
    update: vi
      .fn()
      .mockImplementation((id: string, patch: Partial<Course>) =>
        Promise.resolve({ ...COURSE, ...patch, id }),
      ),
  } as unknown as CourseRepository;

  return { handler: new UpdateCourseHandler(repo), repo };
}

describe('UpdateCourseHandler', () => {
  it('lanza EntityNotFound si el curso no existe', async () => {
    const { handler } = buildHandler(null);
    const cmd = new UpdateCourseCommand('c-1', 'teacher-1', ['teacher'], { title: 'X' });
    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(EntityNotFoundException);
  });

  it('prohíbe editar a quien no es instructor ni admin', async () => {
    const { handler, repo } = buildHandler(COURSE);
    const cmd = new UpdateCourseCommand('c-1', 'otro', ['teacher'], { title: 'X' });
    await expect(handler.execute(cmd)).rejects.toBeInstanceOf(ForbiddenDomainException);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('permite al instructor dueño actualizar', async () => {
    const { handler, repo } = buildHandler(COURSE);
    const cmd = new UpdateCourseCommand('c-1', 'teacher-1', ['teacher'], { title: 'Nuevo' });
    const result = await handler.execute(cmd);
    expect(repo.update).toHaveBeenCalledWith('c-1', { title: 'Nuevo' });
    expect(result.title).toBe('Nuevo');
  });

  it('permite a un admin actualizar aunque no sea el instructor', async () => {
    const { handler, repo } = buildHandler(COURSE);
    const cmd = new UpdateCourseCommand('c-1', 'admin-9', ['admin'], { title: 'Admin edit' });
    await handler.execute(cmd);
    expect(repo.update).toHaveBeenCalledWith('c-1', { title: 'Admin edit' });
  });

  it('aplica solo los campos presentes (patch selectivo)', async () => {
    const { handler, repo } = buildHandler(COURSE);
    const cmd = new UpdateCourseCommand('c-1', 'teacher-1', ['teacher'], {
      subtitle: 'Sub',
      academicYear: 2026,
    });
    await handler.execute(cmd);
    expect(repo.update).toHaveBeenCalledWith('c-1', { subtitle: 'Sub', academicYear: 2026 });
  });
});
