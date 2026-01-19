export function validateOrigin(origin: string): boolean {
  if (origin === '' || origin === '*') {
    return false;
  }

  try {
    const url = new URL(origin);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function parseAllowedOrigins(raw?: string): string[] {
  if (raw === undefined || raw === null || raw.trim() === '') {
    return [];
  }
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter(validateOrigin);
}
