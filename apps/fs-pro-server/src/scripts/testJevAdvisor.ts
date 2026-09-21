import { JevService } from '../services/ai/jev.service';

async function testJevAdvisor() {
  console.log('--- Testing Jev Managerial Strategy Advisory for Royal Philamentia ---');

  // Simulate Royal Philamentia crisis context
  const rpState = {
    gamesWithoutWin: 4,
    concededRate: 2.4,
    leagueAvg: 1.2,
    concededHigh: true,
    weakestUnit: 'Defence',
    currentStyle: 'High Press',
    squadSize: 18,
  };

  const response = JevService.fallbackEvaluate(rpState, {
    crisisLevel: {
      type: 'choice',
      instructions: "Determine crisis severity",
      criteria: {
        crisis: 'Crisis',
        underperforming: 'Underperforming',
        balanced: 'Balanced',
        surging: 'Surging',
      },
    },
    tacticalPivot: {
      type: 'choice',
      instructions: "Tactical pivot",
      criteria: {
        'low-block': 'Low block',
        'counter-attack': 'Counter attack',
        possession: 'Possession',
        'high-press': 'High press',
      },
    },
    trainingDirective: {
      type: 'choice',
      instructions: "Training focus",
      criteria: {
        Defending: 'Defending',
        Physical: 'Physical',
        Attacking: 'Attacking',
        Technical: 'Technical',
      },
    },
  });

  const crisis = (response.answers.crisisLevel as any).choice;
  const tactic = (response.answers.tacticalPivot as any).choice;
  const training = (response.answers.trainingDirective as any).choice;

  console.log('\nJev Advisory Evaluations for Royal Philamentia:');
  console.log('   Crisis Level:', crisis);
  console.log('   Tactical Pivot:', tactic);
  console.log('   Training Directive:', training);

  if (crisis !== 'crisis' && crisis !== 'underperforming') {
    throw new Error('Jev did not recognize Royal Philamentia crisis condition!');
  }

  if (tactic !== 'low-block' && tactic !== 'counter-attack') {
    throw new Error('Jev did not recommend a defensive tactical pivot for leaky defense!');
  }

  if (training !== 'Defending') {
    throw new Error('Jev did not prioritize Defending training for a defense-bottlenecked team!');
  }

  console.log('\n✅ ALL JEV MANAGERIAL ADVISOR TESTS PASSED!');
}

testJevAdvisor().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
