import { randomUUID } from 'node:crypto';

export class UniqueEntityID {
  private readonly _value: string;

  constructor(id?: string) {
    this._value = id ?? randomUUID();
  }

  get value(): string {
    return this._value;
  }

  toString(): string {
    return this._value;
  }

  equals(other?: UniqueEntityID): boolean {
    if (!other) return false;
    return this._value === other._value;
  }
}
