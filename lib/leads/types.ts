// Client-safe lead constants + types. NO database imports here — client
// components import from this module so the pg driver never enters their bundle.
export const LEAD_STAGES = ["new", "contacted", "quoted", "won", "lost"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export interface LeadRow {
  id: string;
  address_line1: string;
  city: string;
  channel: string;
  contact_name: string | null;
  pipeline_stage: LeadStage;
  submitted_at: string;
  grand_total: string | null;
  range_low: string | null;
  range_high: string | null;
}

export interface LeadNote {
  id: string;
  body: string;
  created_at: string;
}
