/** Content truncation for AXI principle #3. */

export const DEFAULT_TRUNCATE = 800;

export interface Truncated {
  /** Preview text (<= limit), or full text when not truncated. */
  text: string;
  truncated: boolean;
  totalChars: number;
}

export function truncate(input: string | null | undefined, limit = DEFAULT_TRUNCATE): Truncated {
  const text = input ?? "";
  if (text.length <= limit) {
    return { text, truncated: false, totalChars: text.length };
  }
  return {
    text: text.slice(0, limit),
    truncated: true,
    totalChars: text.length,
  };
}
