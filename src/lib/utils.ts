import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Extract a safe message from an unknown error (avoids repeating "error instanceof Error ? error.message : fallback"). */
export function getErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  if (error && typeof error === "object") {
    const anyErr = error as { message?: unknown; error_description?: unknown; details?: unknown; hint?: unknown }
    if (typeof anyErr.message === "string" && anyErr.message.trim()) return anyErr.message
    if (typeof anyErr.error_description === "string" && anyErr.error_description.trim()) return anyErr.error_description
    if (typeof anyErr.details === "string" && anyErr.details.trim()) return anyErr.details
    if (typeof anyErr.hint === "string" && anyErr.hint.trim()) return anyErr.hint
  }
  return fallback
}
