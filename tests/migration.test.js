import test from 'node:test';
import assert from 'node:assert/strict';
test('additive initialization preserves existing users and requests and is repeatable', { skip: !process.env.RUN_MIGRATION_TESTS }, async () => {
  assert.match(process.env.DB_NAME || '', /_legacy_test$/);
  const { sequelize } = await import('../models/db.js');
  try {
    await sequelize.query('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTO_INCREMENT, name VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL UNIQUE, password VARCHAR(255) NOT NULL, role VARCHAR(255) NOT NULL DEFAULT \'user\', createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL)');
    await sequelize.query("CREATE TABLE IF NOT EXISTS civil_requests (id INTEGER PRIMARY KEY AUTO_INCREMENT, fullName VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL, phone VARCHAR(255) NOT NULL, documentType ENUM('birth','marriage','death') NOT NULL, purpose TEXT NOT NULL, status VARCHAR(255) NOT NULL DEFAULT 'Pending', paymentMethod VARCHAR(255), paymentReference VARCHAR(255), paymentAmount DECIMAL(10,2), createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL)");
    const suffix = Date.now();
    await sequelize.query("INSERT INTO civil_requests (fullName,email,phone,documentType,purpose,status,createdAt,updatedAt) VALUES (?,?,'0','birth','Existing data','pending',NOW(),NOW())", { replacements: [`Existing ${suffix}`, `legacy${suffix}@example.test`] });
    const { initializePlatform, Request } = await import('../models/Platform.js');
    await initializePlatform(); await initializePlatform();
    const request = await Request.findOne({ where: { email: `legacy${suffix}@example.test` } });
    assert.equal(request.fullName, `Existing ${suffix}`);
    assert.equal(request.residentId, null);
    assert.equal(request.paidAt, null);
    const columns = await sequelize.getQueryInterface().describeTable('civil_requests');
    for (const key of ['residentId', 'recordId', 'appointmentDate', 'appointmentStatus', 'rescheduleRequested', 'paidAt']) assert.ok(columns[key], key);
  } finally { await sequelize.close(); }
});
