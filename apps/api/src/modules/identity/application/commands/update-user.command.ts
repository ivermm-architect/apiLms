import { User } from '@cieba/db';
import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';

import { USER_REPOSITORY, UserRepository } from '../../domain/ports/user.repository';

/** Edición de datos descriptivos por el admin. El email nunca se toca. */
export class UpdateUserCommand implements ICommand {
  constructor(
    public readonly id: string,
    public readonly input: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      profession?: string;
    },
  ) {}
}

@CommandHandler(UpdateUserCommand)
export class UpdateUserHandler implements ICommandHandler<UpdateUserCommand, User> {
  constructor(@Inject(USER_REPOSITORY) private readonly repo: UserRepository) {}

  async execute(cmd: UpdateUserCommand): Promise<User> {
    const existing = await this.repo.findById(cmd.id);
    if (!existing) throw new NotFoundException('Usuario no encontrado');

    // Solo aplica los campos definidos (undefined = no tocar).
    const patch: Partial<User> = {};
    if (cmd.input.firstName !== undefined) patch.firstName = cmd.input.firstName;
    if (cmd.input.lastName !== undefined) patch.lastName = cmd.input.lastName;
    if (cmd.input.phone !== undefined) patch.phone = cmd.input.phone;
    if (cmd.input.profession !== undefined) patch.profession = cmd.input.profession;

    return this.repo.update(cmd.id, patch);
  }
}
