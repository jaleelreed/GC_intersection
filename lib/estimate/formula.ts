// US-010: the quantity-formula evaluator. Arithmetic only — numbers,
// dotted identifiers resolved from a context, + - * / and parentheses.
// Deliberately NOT eval(): formulas are data rows; the grammar is closed.

export class FormulaError extends Error {}

type Tok = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  const re = /\s*(?:(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_.]*)|([-+*/()]))/y;
  let i = 0;
  while (i < src.length) {
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m) throw new FormulaError(`bad token at ${i} in "${src}"`);
    if (m[1] !== undefined) out.push({ t: "num", v: Number(m[1]) });
    else if (m[2] !== undefined) out.push({ t: "id", v: m[2] });
    else out.push({ t: "op", v: m[3] });
    i = re.lastIndex;
  }
  return out;
}

export function evaluateFormula(src: string, context: Record<string, number>): number {
  const toks = tokenize(src);
  let pos = 0;

  const peek = () => toks[pos];
  const take = () => toks[pos++];

  function primary(): number {
    const tok = take();
    if (!tok) throw new FormulaError(`unexpected end in "${src}"`);
    if (tok.t === "num") return tok.v;
    if (tok.t === "id") {
      const v = context[tok.v];
      if (v === undefined || Number.isNaN(v)) {
        throw new FormulaError(`unknown identifier "${tok.v}" in "${src}"`);
      }
      return v;
    }
    if (tok.t === "op" && tok.v === "(") {
      const v = expr();
      const close = take();
      if (!close || close.t !== "op" || close.v !== ")") throw new FormulaError(`missing ) in "${src}"`);
      return v;
    }
    if (tok.t === "op" && tok.v === "-") return -primary();
    throw new FormulaError(`unexpected "${tok.v}" in "${src}"`);
  }

  function term(): number {
    let v = primary();
    while (peek()?.t === "op" && (peek() as Tok & { v: string }).v.match(/[*/]/)) {
      const op = (take() as { v: string }).v;
      const r = primary();
      if (op === "/" && r === 0) throw new FormulaError(`division by zero in "${src}"`);
      v = op === "*" ? v * r : v / r;
    }
    return v;
  }

  function expr(): number {
    let v = term();
    while (peek()?.t === "op" && (peek() as Tok & { v: string }).v.match(/[-+]/)) {
      const op = (take() as { v: string }).v;
      v = op === "+" ? v + term() : v - term();
    }
    return v;
  }

  const result = expr();
  if (pos !== toks.length) throw new FormulaError(`trailing tokens in "${src}"`);
  if (!Number.isFinite(result)) throw new FormulaError(`non-finite result from "${src}"`);
  return result;
}
