export type TransferLedgerType = 'transfer' | 'wage' | 'youth_intake';

export interface TransferLedgerInterface {
  _id?: string;
  Type: TransferLedgerType;
  PlayerId?: string | null;
  BuyerClubId?: string | null;
  SellerClubId?: string | null;
  Amount: number;
  /** The game-world Year cycle (Season.Year convention) - only populated on
   * 'wage'/'youth_intake' rows, where it doubles as the double-deduction/
   * double-intake guard key (see transfer.service.ts's deductWagesForYear
   * and player-lifecycle.service.ts's runYouthIntakeForYear). */
  Year?: string | null;
  Note?: string | null;
}
