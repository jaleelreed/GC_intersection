// Client-safe channel constants/types (no DB import).
export type Channel = "embed" | "link" | "qr";
export const CHANNELS: Channel[] = ["link", "qr", "embed"];

export const CHANNEL_LABEL: Record<Channel, string> = {
  link: "Direct link",
  qr: "QR code",
  embed: "Website embed",
};
