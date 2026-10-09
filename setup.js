/*
  Setup script for User and Access Management Module
  Syncs database schema and seeds demo data
*/

import { syncAll } from './models/index.js';
import { seedData } from './models/seed.js';

async function setup() {
  try {
    console.log('📋 Syncing database schema...');
    await syncAll();
    console.log('✓ Schema synced successfully');

    console.log('🌱 Seeding demo data...');
    await seedData();

    console.log('\n✅ Setup completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

setup();
