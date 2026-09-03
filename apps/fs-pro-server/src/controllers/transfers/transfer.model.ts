export type TransferLedgerType = 'transfer' | 'wage';

export interface TransferLedgerInterface {
  _id?: string;
  Type: TransferLedgerType;
  PlayerId?: string | null;
  BuyerClubId?: string | null;
  SellerClubId?: string | null;
  Amount: number;
  /** The game-world Year cycle (Season.Year convention) - only populated on
   * 'wage' rows, where it doubles as the double-deduction guard key. */
  Year?: string | null;
  Note?: string | null;
}
