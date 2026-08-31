"use client";

export default function PrintButton() {
  return (
    <button className="secondary noPrint" onClick={() => window.print()}>
      🖨 Print / Save as PDF
    </button>
  );
}
