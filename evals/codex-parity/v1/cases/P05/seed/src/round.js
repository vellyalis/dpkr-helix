export function roundInvoice(value, mode) {
  if (mode === "half-up") return Math.floor(value + 0.5);
  if (mode === "bankers") {
    const lower = Math.floor(value);
    const fraction = value - lower;
    if (fraction !== 0.5) return Math.round(value);
    return lower % 2 === 0 ? lower : lower + 1;
  }
  throw new Error(`Unsupported rounding mode: ${mode}`);
}
