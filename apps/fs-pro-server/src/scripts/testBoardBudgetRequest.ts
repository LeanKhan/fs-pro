import 'dotenv/config';

import { processBoardBudgetRequest } from '../services/ai/board-budget.service';
import { DrizzleDatabase } from '../db/drizzle';
import { clubs } from '../db/drizzle/schema';

async function main() {
  const db = DrizzleDatabase.getInstance().database;
  const [club] = await db.select().from(clubs).limit(1);

  if (!club) {
    console.error('No club found in DB');
    process.exit(1);
  }

  console.log(`--- Testing Board Budget Request for ${club.Name} (Current Budget: €${club.Budget}) ---`);

  const requestedAmount = 1_500_000;
  console.log(`Submitting Request: €${requestedAmount.toLocaleString()} [Justification: TITLE_CHALLENGE]`);

  const result = await processBoardBudgetRequest(club.id, requestedAmount, 'TITLE_CHALLENGE');

  console.log('\n--- BOARDROOM VERDICT ---');
  console.log('Decision Status:', result.status);
  console.log('Requested Amount: €' + result.requestedAmount.toLocaleString());
  console.log('Granted Amount:   €' + result.grantedAmount.toLocaleString());
  console.log('New Budget:       €' + result.newBudget.toLocaleString());
  console.log('Source:           ' + result.source);
  console.log('Board Statement:  ' + result.boardStatement);
  console.log('Financial Context:', result.financialContext);
  console.log('-------------------------\n');

  process.exit(0);
}

main().catch((err) => {
  console.error('Error during test:', err);
  process.exit(1);
});
