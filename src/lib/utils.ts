import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Extract a safe message from an unknown error (avoids repeating "error instanceof Error ? error.message : fallback"). */
export function getErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return fallback
}
