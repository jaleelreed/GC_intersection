// US-005b hint rules — DATA the extractor iterates, never if-statements in
// the engine (platform doctrine). Each rule carries its provenance note.
// Launch implementation is deterministic keyword matching (no LLM, no key);
// the ai_jobs plumbing is identical whichever engine fills it later.

export type HintKind = "scope_hint" | "risk_flag";

export interface HintRule {
  id: string;
  kind: HintKind;
  pattern: RegExp;
  text: string;
  source: string; // why this rule exists
}

export const HINT_RULES: HintRule[] = [
  {
    id: "moisture",
    kind: "risk_flag",
    pattern: /\b(mold|moisture|damp|mildew|water damage|leak(?:s|ing|y)?)\b/i,
    text: "Moisture mentioned — possible remediation scope before finishes.",
    source: "moisture language predicts hidden remediation cost",
  },
  {
    id: "structural-open",
    kind: "scope_hint",
    pattern: /\b(open (?:up|the)|knock (?:down|out)|remove|take (?:down|out))\b[^.]{0,40}\bwalls?\b/i,
    text: "Wall removal described — structural review and possible engineering.",
    source: "wall-removal language implies structural flag even when untoggled",
  },
  {
    id: "asbestos-lead",
    kind: "risk_flag",
    pattern: /\b(asbestos|lead paint|lead pipe)\b/i,
    text: "Hazardous material mentioned — abatement scope and testing.",
    source: "hazmat words are never priced silently",
  },
  {
    id: "foundation",
    kind: "risk_flag",
    pattern: /\b(sag(?:ging|s)?|slop(?:e|ing)|crack(?:s|ed|ing)?|settl(?:e|ing|ed)|uneven)\b[^.]{0,40}\b(floor|foundation|wall|slab)s?\b/i,
    text: "Possible settlement/foundation language — inspection before pricing structure.",
    source: "settlement words predict structural scope",
  },
  {
    id: "permit-history",
    kind: "scope_hint",
    pattern: /\b(unpermitted|no permit|without (?:a )?permit)\b/i,
    text: "Unpermitted prior work mentioned — legalization scope may apply.",
    source: "unpermitted work changes permitting scope",
  },
  {
    id: "addition",
    kind: "scope_hint",
    pattern: /\b(addition|extend(?:ing)?|bump[- ]?out)\b/i,
    text: "Addition/extension described — confirm the structural-intervention flags.",
    source: "narrative additions often arrive with the flag untoggled",
  },
  {
    id: "electrical-age",
    kind: "risk_flag",
    pattern: /\b(knob[- ]and[- ]tube|fuse box|60[- ]amp)\b/i,
    text: "Aged electrical service mentioned — service upgrade may be required.",
    source: "old service language predicts panel/service scope",
  },
  {
    id: "diy-history",
    kind: "risk_flag",
    pattern: /\b(diy|previous owner did|handyman|flipped?)\b/i,
    text: "Prior non-professional work mentioned — allow for correction scope.",
    source: "DIY history predicts rework",
  },
];
