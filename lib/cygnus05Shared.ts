export const CYGNUS_LOCAL_BASE_URL = "cygnus-local";
export const CYGNUS_LOCAL_MODEL = "cygnus-0.5";
export const CYGNUS_LOCAL_LABEL = "Cygnus 0.5 Femto";

export function isCygnusLocalProvider(provider: { baseUrl: string }): boolean {
  return provider.baseUrl === CYGNUS_LOCAL_BASE_URL;
}
