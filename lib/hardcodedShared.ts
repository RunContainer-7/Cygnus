export const HARDCODED_BASE_URL = "hardcoded";
export const HARDCODED_MODEL = "hardcoded-intelligence";
export const HARDCODED_LABEL = "Hard Coded Intelligence";

/** True for the deterministic Cygnus Labs assistant, which has no model behind it. */
export function isHardcodedProvider(provider: {
  baseUrl?: string;
  model?: string;
}): boolean {
  return (
    provider.baseUrl === HARDCODED_BASE_URL || provider.model === HARDCODED_MODEL
  );
}
