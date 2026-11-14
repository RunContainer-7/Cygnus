export type HostedTier = "low" | "balanced" | "max";

export type HostedUpstream = {
  baseUrl: string;
  model: string;
};

export type HostedModel = {
  id: string;
  name: string;
  tier: HostedTier;
  note: string;
  recommended?: boolean;
  badge?: string;
  upstreams: HostedUpstream[];
};

export const HOSTED_BASE_URL = "hosted";

const KILO = "https://ai-gateway.kilo.ai/api/v1";

/**
 * Free, no-key open-weight models served through Kilo AI Gateway's anonymous
 * free tier. These are shared public capacity, not a paid SLA. Keep Local and
 * BYOK available for private work or when the free route is busy.
 */
export const HOSTED_MODELS: HostedModel[] = [
  {
    id: "lfm-3-1.7b",
    name: "LFM 3 1.7B",
    tier: "low",
    badge: "Fast",
    note: "Tiny open-weight agent. Quick edits; no key.",
    upstreams: [{ baseUrl: KILO, model: "liquid/lfm-3-1.7b:free" }],
  },
  {
    id: "nemotron-lightning",
    name: "Nemotron 3.5 Lightning",
    tier: "balanced",
    recommended: true,
    note: "30B open-weight agent. Stronger multi-file work; no key.",
    upstreams: [{ baseUrl: KILO, model: "nvidia/nemotron-3.5-lightning:free" }],
  },
  {
    id: "nemotron-ultra",
    name: "Nemotron 3 Ultra 550B",
    tier: "max",
    badge: "Frontier",
    note: "550B open-weight reasoning. Slower; no key.",
    upstreams: [{ baseUrl: KILO, model: "nvidia/nemotron-3-ultra-550b-a55b:free" }],
  },
];

export function isHostedBaseUrl(baseUrl: string): boolean {
  return baseUrl === HOSTED_BASE_URL;
}

export function findHostedModel(id: string): HostedModel | undefined {
  return HOSTED_MODELS.find((entry) => entry.id === id);
}

export function hostedUpstreams(id: string): HostedUpstream[] {
  return findHostedModel(id)?.upstreams ?? [];
}
