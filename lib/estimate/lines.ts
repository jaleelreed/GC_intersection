// US-012b: the line-structure invariant, enforced at runtime on EVERY path
// that creates lines (engine now, editor in EP-03). A flattened text+price
// line is a build error — this throws before it can reach the database.
import { toScaled, mulScaled, scaledToCentsString } from "./money";

export interface ConvertibleLine {
  cost_code_id: string;
  cost_kind: string;
  description: string;
  quantity: string; // numeric(15,4) string
  uom: string;
  unit_cost: string; // numeric(15,4) string
  total: string; // numeric(15,2) string
  seed_source: string;
}

export class LineStructureError extends Error {}

export function assertConvertibleLine(line: ConvertibleLine): void {
  if (!line.cost_code_id) throw new LineStructureError(`line "${line.description}" has no cost_code_id`);
  if (!line.uom) throw new LineStructureError(`line "${line.description}" has no uom`);
  if (!line.description?.trim()) throw new LineStructureError("line has no description");
  if (!["market_seed", "learned", "gc_edit"].includes(line.seed_source)) {
    throw new LineStructureError(`line "${line.description}" has invalid seed_source "${line.seed_source}"`);
  }
  const expected = scaledToCentsString(mulScaled(toScaled(line.quantity), toScaled(line.unit_cost)));
  if (expected !== line.total) {
    throw new LineStructureError(
      `line "${line.description}": total ${line.total} != qty×unit ${expected} — unit basis is broken`
    );
  }
}
