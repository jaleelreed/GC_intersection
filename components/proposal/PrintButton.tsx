"use client";
// US-016: the buyer saves the bid as a PDF via the browser's print dialog
// (no server-side PDF dependency; "Save as PDF" is a print target everywhere).
export function PrintButton() {
  return (
    <button type="button" className="gci-printbtn gci-noprint" onClick={() => window.print()}>
      Save as PDF
    </button>
  );
}
