/**
 * The league pyramid: how many tiers, how wide each is, and how clubs move
 * between them. Everything tunable lives here.
 *
 * Tier 1 is the top flight (1 pod); each tier below has `fanout` times as many
 * pods. A pod's parent is the pod one tier up that it feeds:
 *   parentPod(pod) = floor(pod / fanout)
 * and a pod's children are pods pod*fanout .. pod*fanout + fanout - 1.
 *
 * Pod sizes stay constant when every pod promotes U clubs and relegates
 * R = fanout x U clubs (it then sends up U and down R, and receives
 * fanout x U from below and R / fanout = U from above). Top-tier pods
 * promote nobody; bottom-tier pods relegate nobody.
 */
export interface PyramidConfig {
  /** Number of tiers to start with (more can be added below later). */
  tiers: number;
  /** Clubs per pod. */
  podSize: number;
  /** How many child pods each pod feeds / receives promotions from. */
  fanout: number;
  /** Clubs a pod promotes to its parent (U). */
  promotedPerPod: number;
}

export const PYRAMID_CONFIG: PyramidConfig = {
  tiers: 5,
  podSize: 20,
  fanout: 2,
  promotedPerPod: 2,
};

/** Pods in a tier (tier 1 = 1). */
export const podsInTier = (tier: number, cfg = PYRAMID_CONFIG) =>
  Math.pow(cfg.fanout, tier - 1);

/** Clubs a pod in `tier` sends up (0 for the top flight). */
export const promotedFrom = (tier: number, cfg = PYRAMID_CONFIG) =>
  tier <= 1 ? 0 : cfg.promotedPerPod;

/** Clubs a pod in `tier` sends down (0 for the bottom tier). */
export const relegatedFrom = (tier: number, bottomTier: number, cfg = PYRAMID_CONFIG) =>
  tier >= bottomTier ? 0 : cfg.fanout * cfg.promotedPerPod;

/** Pod one tier up that this pod is promoted into. `fanout` is the real
 * pods-per-parent ratio between the two tiers (see pyramid.service.ts's
 * fanoutBelow) - it defaults to the config's but existing countries can
 * differ (e.g. 1 tier-2 pod per tier-1 pod). */
export const parentPod = (pod: number, fanout = PYRAMID_CONFIG.fanout) =>
  Math.floor(pod / fanout);

/** Pod one tier down that the `index`-th relegated club (0-based, in
 * finishing order) drops into: spread round-robin across the child pods. */
export const relegationTargetPod = (
  pod: number,
  index: number,
  fanout = PYRAMID_CONFIG.fanout
) => pod * fanout + (index % fanout);
