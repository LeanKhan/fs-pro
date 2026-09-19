import { HeuristicGatekeeperService } from '../services/ai/heuristic-gatekeeper.service';

async function testGatekeeper() {
  console.log('--- Testing Heuristic Gatekeeper & Jev Decision System ---\n');

  // Test 1: Halftime Tactics
  console.log('1. Halftime Tactic Evaluation:');
  const normalHalftime = await HeuristicGatekeeperService.evaluateHalftimeTactic({
    minute: 45,
    teamScore: 1,
    opponentScore: 0,
    hasRedCard: false,
    currentStyle: 'balanced',
  });
  console.log('   Leading 1-0 (Normal):', normalHalftime);
  if (normalHalftime.resolvedBy !== 'heuristic' || normalHalftime.decision !== 'maintain') {
    throw new Error('Test failed: leading team should be handled by heuristic as maintain');
  }

  const crisisHalftime = await HeuristicGatekeeperService.evaluateHalftimeTactic({
    minute: 45,
    teamScore: 0,
    opponentScore: 3,
    hasRedCard: true,
    currentStyle: 'balanced',
  });
  console.log('   Trailing 0-3 with Red Card (Crisis):', crisisHalftime);
  if (crisisHalftime.resolvedBy !== 'jev') {
    throw new Error('Test failed: crisis situation should escalate to Jev');
  }

  // Test 2: Transfer Bids
  console.log('\n2. Transfer Offer Evaluation:');
  const lowballBid = await HeuristicGatekeeperService.evaluateTransferOffer({
    playerValue: 1_000_000,
    offerAmount: 400_000, // 40%
    playerRating: 72,
    squadSize: 22,
  });
  console.log('   Lowball Bid ($400k for $1M):', lowballBid);
  if (lowballBid.resolvedBy !== 'heuristic' || lowballBid.decision !== 'reject') {
    throw new Error('Test failed: lowball bid should be auto-rejected by heuristic');
  }

  const overpayBid = await HeuristicGatekeeperService.evaluateTransferOffer({
    playerValue: 1_000_000,
    offerAmount: 1_800_000, // 180%
    playerRating: 68,
    squadSize: 22,
  });
  console.log('   Overpay Bid ($1.8M for $1M):', overpayBid);
  if (overpayBid.resolvedBy !== 'heuristic' || overpayBid.decision !== 'accept') {
    throw new Error('Test failed: huge overpay should be auto-accepted by heuristic');
  }

  const realisticBid = await HeuristicGatekeeperService.evaluateTransferOffer({
    playerValue: 1_000_000,
    offerAmount: 1_100_000, // 110%
    playerRating: 75,
    squadSize: 22,
  });
  console.log('   Realistic Bid ($1.1M for $1M):', realisticBid);
  if (realisticBid.resolvedBy !== 'jev') {
    throw new Error('Test failed: realistic bid should escalate to Jev');
  }

  // Test 3: Board Job Security
  console.log('\n3. Manager Job Security:');
  const winningManager = await HeuristicGatekeeperService.evaluateManagerJobSecurity({
    targetPosition: 4,
    currentPosition: 2,
    gamesWithoutWin: 0,
    fanApproval: 0.9,
  });
  console.log('   Exceeding Expectations (2nd place vs 4th target):', winningManager);
  if (winningManager.resolvedBy !== 'heuristic' || winningManager.decision !== 'back') {
    throw new Error('Test failed: winning manager should be backed by heuristic');
  }

  const failingManager = await HeuristicGatekeeperService.evaluateManagerJobSecurity({
    targetPosition: 2,
    currentPosition: 17,
    gamesWithoutWin: 9,
    fanApproval: 0.15,
  });
  console.log('   Disastrous Form (17th vs 2nd target, 9 without win):', failingManager);
  if (failingManager.resolvedBy !== 'heuristic' || failingManager.decision !== 'sack') {
    throw new Error('Test failed: disastrous manager should be sacked by heuristic');
  }

  const tenseManager = await HeuristicGatekeeperService.evaluateManagerJobSecurity({
    targetPosition: 4,
    currentPosition: 7,
    gamesWithoutWin: 3,
    fanApproval: 0.55,
  });
  console.log('   Tense / Borderline (7th vs 4th target):', tenseManager);
  if (tenseManager.resolvedBy !== 'jev') {
    throw new Error('Test failed: borderline manager review should escalate to Jev');
  }

  console.log('\n ALL GATEKEEPER & JEV TESTS PASSED SUCCESSFULLY!');
}

testGatekeeper().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
