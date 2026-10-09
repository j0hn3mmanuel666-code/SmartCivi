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
    console.log('\nDemo Credentials:');
    console.log('  Admin: username=admin, password=Admin@2026!');
    console.log('  Staff: username=juan.delacruz, password=Staff@2026!');
    console.log('  Resident: username=maria.santos, password=Resident@2026!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

setup();
