import { AxiError } from "axi-sdk-js";

/**
 * Usage errors - a bad flag, a missing argument, an unknown subcommand - must
 * exit 2, which the SDK keys off the `VALIDATION_ERROR` code. Everything else
 * (an unreachable server, a bad API key, a failed call) exits 1.
 */
export function usageError(message: string, suggestions: string[] = []): AxiError {
  return new AxiError(message, "VALIDATION_ERROR", suggestions);
}
