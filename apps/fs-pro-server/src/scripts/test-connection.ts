/**
 * Test database connections
 * Usage: ts-node src/scripts/test-connection.ts
 */

import * as dotenv from 'dotenv';
dotenv.config();

import DB from '../db';

async function testConnection() {
  console.log('🧪 Testing database connection...\n');

  try {
    // Start the database
    await DB.start();

    console.log('✅ Database connection successful!');
    console.log(`📊 Using: ${DB.databaseType}`);
    console.log('\n📦 Available models:');

    const models = DB.Models;
    Object.keys(models).forEach((modelName) => {
      const status = models[modelName] ? '✓' : '✗';
      console.log(`  ${status} ${modelName}`);
    });

    // Test a simple query (if using MongoDB)
    if (DB.databaseType === 'mongodb') {
      try {
        const count = await DB.Models.User.countDocuments();
        console.log(`\n👥 Users in database: ${count}`);
      } catch (err) {
        console.log('\n⚠️  Could not query users (this is normal if collection is empty)');
      }
    }

    console.log('\n✨ Connection test completed successfully!');
  } catch (error) {
    console.error('\n❌ Connection test failed:', error);
    process.exit(1);
  } finally {
    await DB.disconnect();
    process.exit(0);
  }
}

testConnection();
