import { EventBus } from '@nestjs/cqrs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EnrollmentAlreadyExistsException } from '../../../../shared/exceptions/domain.exception';
import { StudentEnrolledEvent } from '../../domain/events/student-enrolled.event';

import { EnrollCommand, EnrollHandler } from './enroll.command';

const buildHandler = (overrides?: { existing?: unknown }) => {
  const repo = {
    findByUserAndCourse: vi.fn().mockResolvedValue(overrides?.existing ?? null),
    create: vi.fn().mockResolvedValue({ id: 'enr-1', userId: 'u1', courseId: 'c1' }),
  };
  const eventBus = { publish: vi.fn() } as unknown as EventBus;
  const handler = new EnrollHandler(repo as never, eventBus);
  return { handler, repo, eventBus };
};

describe('EnrollHandler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('crea inscripción y publica StudentEnrolledEvent', async () => {
    const { handler, repo, eventBus } = buildHandler();

    const result = await handler.execute(new EnrollCommand('u1', 'c1'));

    expect(result.id).toBe('enr-1');
    expect(repo.create).toHaveBeenCalledWith({
      userId: 'u1',
      courseId: 'c1',
    });
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(StudentEnrolledEvent));
  });

  it('lanza EnrollmentAlreadyExistsException si ya existe inscripción', async () => {
    const { handler, repo } = buildHandler({ existing: { id: 'enr-old' } });

    await expect(handler.execute(new EnrollCommand('u1', 'c1'))).rejects.toBeInstanceOf(
      EnrollmentAlreadyExistsException,
    );
    expect(repo.create).not.toHaveBeenCalled();
  });
});
