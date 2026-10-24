export class AxiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly suggestions: string[] = [],
  ) {
    super(message);
    this.name = "AxiError";
  }
}

export function exitCodeForError(error: unknown): number {
  if (error instanceof AxiError && error.code === "VALIDATION_ERROR") {
    return 2;
  }

  return 1;
}
