import { isNotNullOrEmpty } from './validation.util.js';

export function parseBoolean(value: unknown, fieldName?: string): boolean {
  const errorMessage = isNotNullOrEmpty(fieldName) ? `Failed to parse ${fieldName} as boolean` : 'Failed to parse value as boolean';

  if (typeof value === 'boolean') {
    return value;
  }

  if (value === null || value === undefined || value === '') {
    throw new TypeError(`${errorMessage}: value is null, undefined, or empty`);
  }

  if (typeof value === 'object') {
    throw new TypeError(`${errorMessage}: objects cannot be parsed as boolean`);
  }

  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new TypeError(`${errorMessage}: unsupported value type for boolean parsing`);
  }

  const str = String(value).trim().toLowerCase();
  const truthy = ['true', '1', 'yes'];
  const falsy = ['false', '0', 'no'];

  if (truthy.includes(str)) {
    return true;
  }
  if (falsy.includes(str)) {
    return false;
  }

  throw new TypeError(`${errorMessage}: unsupported value "${str}"`);
}
