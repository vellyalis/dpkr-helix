import { LOCALE_ALIASES } from "./aliases.js";
import { CATALOG } from "./catalog.js";

export const DEFAULT_LOCALE = "en";

export function greetingFor(locale) {
  const normalized = locale.toLowerCase().replaceAll("_", "-");
  const resolved = LOCALE_ALIASES.get(normalized) ?? normalized;
  return CATALOG.get(resolved) ?? CATALOG.get(DEFAULT_LOCALE);
}
