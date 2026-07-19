"use client";
// Client-side photo picker + compressor. Downscales to a max dimension and
// re-encodes as JPEG so the whole submission payload stays under the
// serverless request limit. No upload library — canvas only.
import { useState } from "react";

export interface Photo {
  content_type: "image/jpeg";
  data_base64: string;
  preview: string;
}

const MAX_DIM = 1600;
const MAX_PHOTOS = 6;

async function compress(file: File): Promise<Photo | null> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  const jpeg = canvas.toDataURL("image/jpeg", 0.7);
  const base64 = jpeg.split(",")[1] ?? "";
  return { content_type: "image/jpeg", data_base64: base64, preview: jpeg };
}

export function PhotoUpload({ photos, setPhotos }: { photos: Photo[]; setPhotos: (p: Photo[]) => void }) {
  const [busy, setBusy] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setBusy(true);
    const next: Photo[] = [...photos];
    for (const f of files) {
      if (next.length >= MAX_PHOTOS) break;
      if (!f.type.startsWith("image/")) continue;
      const c = await compress(f).catch(() => null);
      if (c) next.push(c);
    }
    setPhotos(next);
    setBusy(false);
    e.target.value = "";
  }

  return (
    <div data-field="photos">
      <p className="gci-hint">Add photos (optional) — up to {MAX_PHOTOS}. Helps the contractor bid accurately.</p>
      <input type="file" accept="image/*" multiple onChange={onPick} disabled={busy || photos.length >= MAX_PHOTOS} />
      {busy && <span className="gci-hint"> compressing…</span>}
      <div className="gci-photo-grid">
        {photos.map((p, i) => (
          <div key={i} className="gci-photo-thumb">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.preview} alt={`photo ${i + 1}`} />
            <button type="button" onClick={() => setPhotos(photos.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
