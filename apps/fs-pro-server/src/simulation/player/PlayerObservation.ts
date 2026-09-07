/**
 * Milestone 7 - formalizes what `Decider.ts` already computes ad hoc per
 * decision (pressure, nearby teammates, goal distance) into a named
 * struct. Deliberately narrow - `passingOptions`/`availableSpace`-shaped
 * fields from the plan doc's sketch are NOT here yet; scoring real
 * candidate passes is Milestone 13's job. Milestone 10 (Spatial Analysis
 * Services) moved the underlying pressure/nearest-teammate/goal-distance
 * formulas into `spatial/PressureAnalyzer.ts`/`spatial/SpatialAnalyzer.ts`
 * - `ObservationBuilder` and `Decider` both call those now, so this struct
 * is no longer built from a second, independently-drifting copy of
 * Decider's own geometry.
 */
export interface VisiblePlayer {
  playerId?: string;
  position: string;
  distance: number;
}

export interface PlayerObservation {
  self: {
    position: { x: number; y: number };
    withBall: boolean;
  };
  /** Opposing non-GK outfield players within the pressure radius -
   * mirrors Decider.countPressure()'s existing default radius (3). */
  pressure: number;
  /** Distance to the attacking side's scoring post. */
  goalDistance: number;
  /** The 3 closest active teammates by distance - mirrors
   * Decider.passability()'s existing "several closest, not just nearest"
   * selection. */
  teammates: VisiblePlayer[];
  /** Active non-GK opponents within the same pressure radius as
   * `pressure` above. */
  opponents: VisiblePlayer[];
}
