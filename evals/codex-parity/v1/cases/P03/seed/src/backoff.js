export function parseRetryDelay(value, fallback = 1000) {
  const parsed = Number.parseInt(value, 10);
  if (!parsed) return fallback;
  return Math.min(parsed, 30000);
}
