export function parseDuration(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (match === null || match === undefined) {
    throw new Error('Invalid duration format');
  }
  const value = Number.parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      return 15 * 60 * 1000;
  }
}
