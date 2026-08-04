export const HASHER_PORT = Symbol('HASHER_PORT');

export interface HasherPort {
  hash(plain: string): Promise<string>;
  compare(plain: string, hash: string): Promise<boolean>;
}
