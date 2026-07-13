/**
 * Structured errors for AXI principle #6.
 * Errors are printed to stdout in the same format as normal output so the
 * agent can parse them. Exit codes: 0 = success (incl. no-ops), 1 = error,
 * 2 = usage error (missing/unknown flags, bad arguments).
 */

export type ExitCode = 0 | 1 | 2;

export class AxiError extends Error {
  readonly exitCode: ExitCode;
  /** Optional help lines shown under the error to make it self-correcting. */
  readonly help: string[];

  constructor(message: string, opts: { exitCode?: ExitCode; help?: string[] } = {}) {
    super(message);
    this.name = "AxiError";
    this.exitCode = opts.exitCode ?? 1;
    this.help = opts.help ?? [];
  }
}

/** Usage error (exit 2): missing required flag, unknown flag, bad argument. */
export function usageError(message: string, help: string[] = []): AxiError {
  return new AxiError(message, { exitCode: 2, help });
}
