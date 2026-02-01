export function parseBoolean(value: unknown, fieldName?: string): boolean {
  const errorMessage =
    fieldName !== undefined && fieldName !== null && fieldName !== ''
      ? `Failed to parse ${fieldName} as boolean`
      : 'Failed to parse value as boolean';

  if (typeof value === 'boolean') {
    return value;
  }

  if (value === null || value === undefined || value === '') {
    throw new Error(`${errorMessage}: value is null, undefined, or empty`);
  }

  if (typeof value === 'object') {
    throw new Error(`${errorMessage}: objects cannot be parsed as boolean`);
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

  throw new Error(`${errorMessage}: unsupported value "${str}"`);
}
