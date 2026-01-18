export function parseBoolean(value: unknown, fieldName?: string): boolean {
  const errorMessage =
    fieldName !== null && fieldName !== undefined && fieldName !== ''
      ? `Failed to parse ${fieldName} as boolean`
      : 'Failed to parse value as boolean';

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (value === 0) {
      return false;
    }
    if (value === 1) {
      return true;
    }
    throw new Error(`${errorMessage}: number must be 0 or 1`);
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no'].includes(normalized)) {
      return false;
    }
    throw new Error(`${errorMessage}: invalid string value "${value}"`);
  }

  const stringValue = String(value ?? '')
    .trim()
    .toLowerCase();
  if (stringValue === '' || stringValue === 'null' || stringValue === 'undefined') {
    throw new Error(`${errorMessage}: value is null, undefined, or empty`);
  }

  if (['true', '1', 'yes'].includes(stringValue)) {
    return true;
  }
  if (['false', '0', 'no'].includes(stringValue)) {
    return false;
  }

  throw new Error(`${errorMessage}: unsupported type or value`);
}
