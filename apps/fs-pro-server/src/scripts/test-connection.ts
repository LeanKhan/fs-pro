/**
 * Test database connection
 * Usage: ts-node src/scripts/test-connection.ts
 */

import * as dotenv from 'dotenv';
dotenv.config();

import DB from '../db';

async function testConnection() {
  console.log('🧪 Testing database connection...\n');

  try {
    await DB.start();

    console.log('✅ Database connection successful!');
    console.log('\n📦 Available models:');

    const models = DB.Models;
    Object.keys(models).forEach((modelName) => {
      const status = models[modelName] ? '✓' : '✗';
      console.log(`  ${status} ${modelName}`);
    });

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
