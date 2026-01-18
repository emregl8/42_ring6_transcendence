export function isNullOrEmpty(value: unknown): value is null | undefined | '' {
  return value === null || value === undefined || value === '';
}

export function isNotNullOrEmpty<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined && value !== '';
}
