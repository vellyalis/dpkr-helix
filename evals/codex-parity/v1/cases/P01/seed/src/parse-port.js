export function parsePort(value) {
  if (!Number.isInteger(value) || value < 0 || value > 65535) return null;
  return value;
}
