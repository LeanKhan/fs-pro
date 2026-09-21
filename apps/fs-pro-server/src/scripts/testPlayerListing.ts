import 'dotenv/config';
import { DrizzleDatabase } from '../db/drizzle';
import { clubs, players, transferOffers } from '../db/drizzle/schema';
import { eq } from 'drizzle-orm';
import { JevService } from '../services/ai/jev.service';
import { listPlayerForSale } from '../services/transfers/transfer-market.service';
import { recruitYouthPlayersForClub } from '../controllers/players/player-lifecycle.service';
import { openTransferWindow } from '../services/transfers/transfer-window.service';

async function main() {
  console.log('--- Testing Player Listing & Youth Integration ---');

  // Ensure DB connected
  const db = DrizzleDatabase.getInstance().database;

  // 1. Test Jev player reactions directly (offline local fallback)
  console.log('\n1. Testing Jev playerListingReaction fallback...');
  const veteranReaction = await JevService.generatePlayerListingReaction({
    playerName: 'Marcus Vance',
    age: 32,
    rating: 80,
    value: 5000000,
    askingPrice: 4800000,
    isYouth: false,
    clubName: 'Royal Philamentia',
  });
  console.log('Veteran Reaction:', veteranReaction);

  const youthReaction = await JevService.generatePlayerListingReaction({
    playerName: 'Leo Sterling',
    age: 17,
    rating: 62,
    value: 450000,
    askingPrice: 600000,
    isYouth: true,
    clubName: 'Royal Philamentia',
  });
  console.log('Youth Prospect Reaction:', youthReaction);

  if (!veteranReaction.sentiment || !veteranReaction.quote || !youthReaction.sentiment) {
    throw new Error('Jev reaction failed');
  }

  // 2. Find a club (e.g. Royal Philamentia)
  const allClubs = await db.select().from(clubs);
  const rp = allClubs.find((c) => c.ClubCode === 'RP') ?? allClubs[0];
  if (!rp) throw new Error('No club found in database');
  console.log(`\n2. Using club: ${rp.Name} (${rp.ClubCode})`);

  // Ensure transfer window is open
  await openTransferWindow(10);

  // 3. Scout a youth player for this club
  console.log('\n3. Recruiting Youth Player...');
  const [youth] = await recruitYouthPlayersForClub({ _id: rp.id, ClubCode: rp.ClubCode }, 1);
  console.log(`Recruited youth: ${youth.FirstName} ${youth.LastName} (Age: ${youth.Age}, Pos: ${youth.Position}, isYouth: ${youth.isYouth})`);

  // 4. Put the youth player up for sale
  console.log('\n4. Listing youth player for sale...');
  const youthId = (youth as any)._id ?? (youth as any).id;
  const listingResult = await listPlayerForSale({
    playerId: youthId,
    clubId: rp.id,
    isListed: true,
    askingPrice: 750000,
  });

  console.log('Listing Result Player:', {
    id: listingResult.player.id,
    name: `${listingResult.player.FirstName} ${listingResult.player.LastName}`,
    isTransferListed: listingResult.player.isTransferListed,
    AskingPrice: listingResult.player.AskingPrice,
    Morale: listingResult.player.Morale,
  });
  console.log('Jev Reaction Quote:', listingResult.reaction.quote);
  console.log('Market Interest:', listingResult.marketInterest);
  if (listingResult.newOffer) {
    console.log('Immediate AI Offer Generated:', {
      offerId: listingResult.newOffer.id,
      amount: listingResult.newOffer.amount,
      from: listingResult.newOffer.fromClub.name,
    });
  }

  if (!listingResult.player.isTransferListed || listingResult.player.AskingPrice !== 750000) {
    throw new Error('Player listing failed in database');
  }

  // 5. Test senior player listing
  console.log('\n5. Listing senior player for sale...');
  const seniorPlayers = await db.select().from(players).where(eq(players.ClubId, rp.id));
  const senior = seniorPlayers.find((p) => !p.isYouth && (p.Value ?? 0) > 100000) ?? seniorPlayers[0];
  if (senior) {
    const seniorResult = await listPlayerForSale({
      playerId: senior.id,
      clubId: rp.id,
      isListed: true,
      askingPrice: senior.Value,
    });
    console.log('Senior Player Listed:', {
      name: `${senior.FirstName} ${senior.LastName}`,
      rating: senior.Rating,
      value: senior.Value,
      morale: seniorResult.reaction.morale,
      quote: seniorResult.reaction.quote,
      marketInterest: seniorResult.marketInterest,
      instantOffer: seniorResult.newOffer ? `${seniorResult.newOffer.amount} from ${seniorResult.newOffer.fromClub.name}` : 'None',
    });
  }

  // 6. Test unlisting
  console.log('\n6. Unlisting player...');
  const unlistResult = await listPlayerForSale({
    playerId: youthId,
    clubId: rp.id,
    isListed: false,
  });
  console.log('Unlisted player isTransferListed:', unlistResult.player.isTransferListed);
  if (unlistResult.player.isTransferListed) {
    throw new Error('Player unlisting failed');
  }

  console.log('\n✅ All tests passed successfully!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
