import { User } from '@cieba/db';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserFilter {
  status?: User['status'];
  search?: string;
  roleName?: string;
}

export interface ListUsersInput {
  filter?: UserFilter;
  page: number;
  pageSize: number;
  sortBy?: 'createdAt' | 'email' | 'lastName';
  sortOrder?: 'asc' | 'desc';
}

export interface CreateUserRepoInput {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  birthday?: Date | null;
  profession?: string | null;
  documentId?: string | null;
  studentCode?: string | null;
  mustChangePassword?: boolean;
  status?: User['status'];
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  list(input: ListUsersInput): Promise<{ items: User[]; total: number }>;
  create(input: CreateUserRepoInput): Promise<User>;
  update(id: string, input: Partial<User>): Promise<User>;
  softDelete(id: string): Promise<void>;
  assignRoles(userId: string, roleIds: string[]): Promise<void>;
  getUserRoles(userId: string): Promise<string[]>;
}
