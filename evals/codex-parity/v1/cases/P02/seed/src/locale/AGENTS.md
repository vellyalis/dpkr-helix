# Locale ownership

- Locale aliases belong only in `aliases.js`.
- The public locale list belongs only in `supported.js`.
- `resolver.js` must remain data-driven; do not add locale-specific conditionals.
- Preserve `DEFAULT_LOCALE = "en"` and the unknown-locale fallback.
