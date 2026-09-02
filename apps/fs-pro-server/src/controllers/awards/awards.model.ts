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
  Recipient: string;
  Club: string;
  Remarks: string;
  Season: string;
}
