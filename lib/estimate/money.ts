// Exact money math on scaled integers — no float arithmetic on money paths
// (contracts §cross-cutting #2). Unit costs are numeric(15,4): scale 1e4.
// Totals are numeric(15,2): rounded half-up to cents at the boundary.

export type Scaled = bigint; // value * 10_000

export const SCALE = 10_000n;

export function toScaled(s: string | number): Scaled {
  const str = typeof s === "number" ? s.toFixed(4) : s;
  const neg = str.startsWith("-");
  const [rawInt, rawFrac = ""] = (neg ? str.slice(1) : str).split(".");
  const frac = (rawFrac + "0000").slice(0, 4);
  const v = BigInt(rawInt || "0") * SCALE + BigInt(frac);
  return neg ? -v : v;
}

/** (a * b) at scale — both operands scaled; result scaled, half-up. */
export function mulScaled(a: Scaled, b: Scaled): Scaled {
  const p = a * b;
  const half = SCALE / 2n;
  return (p + (p < 0n ? -half : half)) / SCALE;
}

/** Multiply a scaled value by a plain multiplier given as string ("1.25"). */
export function applyMultiplier(a: Scaled, multiplier: string): Scaled {
  return mulScaled(a, toScaled(multiplier));
}

/** Render as numeric(15,4) string for Postgres. */
export function scaledToString(v: Scaled): string {
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const int = abs / SCALE;
  const frac = (abs % SCALE).toString().padStart(4, "0");
  return `${neg ? "-" : ""}${int}.${frac}`;
}

/** Round scaled → cents string for numeric(15,2) columns, half-up. */
export function scaledToCentsString(v: Scaled): string {
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const centsScale = 100n;
  const p = abs * centsScale;
  const half = SCALE / 2n;
  const cents = (p + half) / SCALE;
  const int = cents / centsScale;
  const frac = (cents % centsScale).toString().padStart(2, "0");
  return `${neg ? "-" : ""}${int}.${frac}`;
}
