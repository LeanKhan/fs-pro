import { DerbyDetectorService } from '../services/ai/derby-detector.service';
import { MediaHubService } from '../services/media/media-hub.service';
import { JevService } from '../services/ai/jev.service';

async function testMediaHub() {
  console.log('--- Testing Derby Detection & Media Hub ---');

  // 1. Test Philamentia Derby detection (crosstown rivals AP vs RP)
  const ap = {
    Name: 'AC Philamentia',
    ClubCode: 'AP',
    Address: { City: 'Philamentia', Section: 'Philamentia' },
    Stadium: { Name: 'Aktiv Chi Sports Center', Capacity: 12000 },
  };

  const rp = {
    Name: 'Royal Philamentia F.C',
    ClubCode: 'RP',
    Address: { City: 'Philamentia', Section: 'Ivania' },
    Stadium: { Name: 'Royal Arena', Capacity: 18000 },
  };

  const derbyResult = DerbyDetectorService.detect(ap, rp);
  console.log('\n1. Philamentia Derby Detection:');
  console.log('   Is Special Event:', derbyResult.isSpecialEvent);
  console.log('   Event Name:', derbyResult.eventName);
  console.log('   Event Tag:', derbyResult.eventTag);
  console.log('   Narrative Angle:', derbyResult.narrativeAngle);
  console.log('   Hype Score:', derbyResult.hypeScore);

  if (!derbyResult.isSpecialEvent || !derbyResult.eventName.includes('Philamentia Derby')) {
    throw new Error('Derby detection failed for Philamentia Derby!');
  }

  // 2. Test Standings-based Title Decider
  const club1 = { Name: 'Alpha FC', ClubCode: 'ALP' };
  const club2 = { Name: 'Beta FC', ClubCode: 'BET' };
  const titleResult = DerbyDetectorService.detect(club1, club2, { homePos: 1, awayPos: 2, totalTeams: 10 });
  console.log('\n2. Title Decider Detection (1st vs 2nd):');
  console.log('   Is Special Event:', titleResult.isSpecialEvent);
  console.log('   Event Name:', titleResult.eventName);
  console.log('   Event Tag:', titleResult.eventTag);

  if (!titleResult.isSpecialEvent || titleResult.eventType !== 'title_decider') {
    throw new Error('Title decider detection failed!');
  }

  // 3. Test Jev Media Lead Question Fallback
  const jevResponse = JevService.fallbackEvaluate(
    { isDerby: true, isTopClash: false, clubCode: 'AP' },
    {
      mediaLeadStory: {
        type: 'choice',
        instructions: 'What editorial package leads?',
        criteria: {
          derby_spotlight: 'Major derby feature',
          match_preview: 'Match preview',
          club_feature: 'Club feature',
          transfer_buzz: 'Transfers',
        },
      },
      hypeScore: {
        type: 'score',
        instructions: 'Hype score',
        criteria: ['quiet', 'routine', 'buzzing', 'high_anticipation', 'fever_pitch'],
      },
    }
  );

  console.log('\n3. Jev Decision Fallback for Media:');
  console.log('   Lead Story Choice:', (jevResponse.answers.mediaLeadStory as any).choice);
  console.log('   Hype Score:', (jevResponse.answers.hypeScore as any).score);

  if ((jevResponse.answers.mediaLeadStory as any).choice !== 'derby_spotlight') {
    throw new Error('Jev fallback did not select derby_spotlight for a derby event!');
  }

  console.log('\n✅ ALL DERBY DETECTION & JEV MEDIA TESTS PASSED SUCCESSFULLY!');
}

testMediaHub().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
