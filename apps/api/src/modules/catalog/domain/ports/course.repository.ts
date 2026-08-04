import { Course } from '@cieba/db';

export const COURSE_REPOSITORY = Symbol('COURSE_REPOSITORY');

export interface CourseFilter {
  search?: string;
  instructorId?: string;
  status?: Course['status'];
  level?: Course['level'];
  academicYear?: number;
}

export interface ListCoursesInput {
  filter?: CourseFilter;
  page: number;
  pageSize: number;
  sortBy?: 'createdAt' | 'title';
  sortOrder?: 'asc' | 'desc';
}

export interface CreateCourseInput {
  title: string;
  slug: string;
  description: string;
  instructorId: string;
  curriculumId?: string | null;
  subtitle?: string | null;
  level?: 'beginner' | 'intermediate' | 'advanced';
  academicYear?: number;
  language?: string;
}

export interface CourseRepository {
  findById(id: string): Promise<Course | null>;
  findBySlug(slug: string): Promise<Course | null>;
  list(input: ListCoursesInput): Promise<{ items: Course[]; total: number }>;
  create(input: CreateCourseInput): Promise<Course>;
  update(id: string, input: Partial<Course>): Promise<Course>;
  softDelete(id: string): Promise<void>;
  publish(id: string): Promise<Course>;
  recalculateStats(id: string): Promise<void>;
}
