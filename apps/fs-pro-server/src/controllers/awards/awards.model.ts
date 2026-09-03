/**
 * Records like
 * 'Award of the year: 2020 season'
 */
export interface AwardInterface {
  _id?: string;
  Name: string;
  Type: 'manager' | 'player'; // award is for club/manager/player
  Period: 'season' | 'year' | 'all-time';
  Category: string;
  /** Polymorphic - a Player or Manager id depending on `Type`. Populated
   * (under the clean `Recipient` key, added alongside - never replacing -
   * `RecipientId`) only when `?populate=` requests it, see
   * `controllers/awards/index.ts`'s `fetchAll`. */
  RecipientId: string;
  Recipient?: Record<string, unknown>;
  ClubId: string;
  Club?: Record<string, unknown>;
  Remarks: string;
  SeasonId: string;
  Season?: Record<string, unknown>;
}
