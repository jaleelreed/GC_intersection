// US-005/US-006 payload contract tests — pure, no DB.
import { describe, expect, it } from "vitest";
import {
  intakeSubmissionSchema,
  isSpam,
  SCOPE_TOGGLE_KEYS,
  SPAM_FLOOR_MS,
} from "../lib/intake/schema";

export function validPayload() {
  return {
    contact_name: "Pat Homeowner",
    contact_email: "pat@example.com",
    address_line1: "123 Fixture St NW",
    city: "Washington",
    state: "dc",
    postal_code: "20001",
    square_footage: 1450,
    conditions: {
      year_built: 1938,
      occupied: true,
      access: "moderate",
      known_problems: ["water_damage"],
    },
    scope_toggles: Object.fromEntries(
      SCOPE_TOGGLE_KEYS.map((k) => [k, { on: k === "bath" || k === "kitchen", class: k === "bath" ? "reconfigure" : k === "kitchen" ? "in_place" : null }])
    ),
    structural_flags: { walls_removed: true, addition: false, foundation_work: null, roof_structure: null },
    finish_tier: "mid",
    narrative: "We want to open up the kitchen and redo the upstairs bath.",
    form_started_at: Date.now() - 60_000,
  };
}

describe("intake payload contract", () => {
  it("accepts a complete valid payload and normalizes state to uppercase", () => {
    const parsed = intakeSubmissionSchema.parse(validPayload());
    expect(parsed.state).toBe("DC");
    expect(parsed.scope_toggles.bath).toEqual({ on: true, class: "reconfigure" });
  });

  it("accepts toggle-on with class null (unknown class widens, never defaults)", () => {
    const p = validPayload();
    p.scope_toggles.bath = { on: true, class: null };
    const parsed = intakeSubmissionSchema.parse(p);
    expect(parsed.scope_toggles.bath.class).toBeNull();
  });

  it("every conditions field is skippable", () => {
    const p = validPayload();
    // @ts-expect-error deliberate omission
    delete p.conditions;
    const parsed = intakeSubmissionSchema.parse(p);
    expect(parsed.conditions).toEqual({
      year_built: null,
      occupied: null,
      access: null,
      known_problems: [],
    });
  });

  it("rejects an unknown scope-toggle key", () => {
    const p = validPayload() as Record<string, unknown>;
    (p.scope_toggles as Record<string, unknown>).sauna = { on: true, class: null };
    expect(intakeSubmissionSchema.safeParse(p).success).toBe(false);
  });

  it("rejects a missing required field with a per-field error", () => {
    const p = validPayload() as Record<string, unknown>;
    delete p.square_footage;
    const r = intakeSubmissionSchema.safeParse(p);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path[0] === "square_footage")).toBe(true);
    }
  });

  it("rejects a filled honeypot", () => {
    const p = { ...validPayload(), website: "http://spam.example" };
    expect(intakeSubmissionSchema.safeParse(p).success).toBe(false);
  });

  it("flags sub-3s submissions as spam", () => {
    const now = Date.now();
    const fast = intakeSubmissionSchema.parse({ ...validPayload(), form_started_at: now - 1000 });
    const slow = intakeSubmissionSchema.parse({ ...validPayload(), form_started_at: now - SPAM_FLOOR_MS });
    expect(isSpam(fast, now)).toBe(true);
    expect(isSpam(slow, now)).toBe(false);
  });
});
