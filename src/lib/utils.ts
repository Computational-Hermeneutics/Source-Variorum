import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Normalise line endings to LF. Source files arrive with CRLF (Windows) or lone
 *  CR (classic Mac / PDP-era listings such as bitsavers dumps); the collation
 *  engine counts lines by LF, so every witness text is normalised on ingestion. */
export function normalizeNewlines(text: string): string {
  // CRLF/CR → LF, then strip any leading blank or whitespace-only lines so a
  // witness starts at its first real line (no empty rows pushing line 1 down).
  return text.replace(/\r\n?/g, "\n").replace(/^(?:[ \t]*\n)+/, "");
}
