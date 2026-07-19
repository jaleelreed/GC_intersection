// US-005/US-006 intake payload contract (docs/contracts/EP-01-02-contracts.md).
// Server-side authority: the API route rejects anything this file rejects.
import { z } from "zod";

export const SCOPE_TOGGLE_KEYS = [
  "bath",
  "kitchen",
  "floors",
  "walls",
  "utilities",
  "plumbing",
  "electric",
  "mechanical",
  "roof",
  "basement",
] as const;

export const KNOWN_PROBLEMS = [
  "water_damage",
  "foundation_cracks",
  "knob_tube_wiring",
  "galvanized_plumbing",
  "asbestos_suspected",
  "roof_leak",
  "pest_damage",
  "none",
] as const;

export const STRUCTURAL_FLAG_KEYS = [
  "walls_removed",
  "addition",
  "foundation_work",
  "roof_structure",
] as const;

const scopeClass = z.enum(["in_place", "reconfigure", "relocate"]);
const finishTier = z.enum(["economy", "mid", "custom"]);
const access = z.enum(["easy", "moderate", "difficult"]);

// Toggle on with class null = "not sure" — accepted, widens the range (D3).
const toggleState = z
  .object({ on: z.boolean(), class: scopeClass.nullable() })
  .strict();

const configCounts = z
  .object({
    beds: z.number().int().min(0).max(20).nullable().default(null),
    full_baths: z.number().int().min(0).max(20).nullable().default(null),
    half_baths: z.number().int().min(0).max(20).nullable().default(null),
  })
  .strict();

export const intakeSubmissionSchema = z
  .object({
    contact_name: z.string().trim().min(1).max(200),
    contact_email: z.string().trim().email().max(320),
    contact_phone: z.string().trim().max(40).nullable().default(null),

    address_line1: z.string().trim().min(1).max(300),
    address_line2: z.string().trim().max(300).nullable().default(null),
    city: z.string().trim().min(1).max(120),
    state: z.string().trim().length(2).toUpperCase(),
    postal_code: z.string().trim().min(3).max(12),

    square_footage: z.number().positive().max(100000),

    // zod .default() returns its value unparsed, so defaults are spelled out
    // in full — inner-field defaults would not apply to a bare {}.
    existing_config: configCounts.default({ beds: null, full_baths: null, half_baths: null }),
    target_config: configCounts.default({ beds: null, full_baths: null, half_baths: null }),

    conditions: z
      .object({
        year_built: z.number().int().min(1700).max(2100).nullable().default(null),
        occupied: z.boolean().nullable().default(null),
        access: access.nullable().default(null),
        known_problems: z.array(z.enum(KNOWN_PROBLEMS)).default([]),
      })
      .strict()
      .default({ year_built: null, occupied: null, access: null, known_problems: [] }),

    scope_toggles: z
      .object(
        Object.fromEntries(SCOPE_TOGGLE_KEYS.map((k) => [k, toggleState])) as Record<
          (typeof SCOPE_TOGGLE_KEYS)[number],
          typeof toggleState
        >
      )
      .strict(),

    structural_flags: z
      .object(
        Object.fromEntries(
          STRUCTURAL_FLAG_KEYS.map((k) => [k, z.boolean().nullable().default(null)])
        ) as Record<(typeof STRUCTURAL_FLAG_KEYS)[number], z.ZodDefault<z.ZodNullable<z.ZodBoolean>>>
      )
      .strict()
      .default({ walls_removed: null, addition: null, foundation_work: null, roof_structure: null }),

    finish_tier: finishTier.nullable().default(null),

    narrative: z.string().max(2000).nullable().default(null),

    // Optional client-compressed JPEG photos (data URLs). Capped so the whole
    // payload stays under the serverless request limit.
    photos: z
      .array(
        z.object({
          content_type: z.enum(["image/jpeg", "image/png", "image/webp"]),
          data_base64: z.string().max(700_000), // ~500KB binary each
        })
      )
      .max(6)
      .default([]),

    // Anti-spam: honeypot must stay empty; form_started_at drives the 3s floor.
    website: z.string().max(0).optional(),
    form_started_at: z.number().int().positive(),
  })
  .strict();

export type IntakeSubmissionInput = z.infer<typeof intakeSubmissionSchema>;

export const SPAM_FLOOR_MS = 3000;

export function isSpam(input: IntakeSubmissionInput, now: number): boolean {
  return now - input.form_started_at < SPAM_FLOOR_MS;
}
