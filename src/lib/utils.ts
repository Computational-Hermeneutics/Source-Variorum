import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Normalise line endings to LF. Source files arrive with CRLF (Windows) or lone
 *  CR (classic Mac / PDP-era listings such as bitsavers dumps); the collation
 *  engine counts lines by LF, so every witness text is normalised on ingestion. */
export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}
