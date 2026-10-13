/*
 * Migration script to create attachments table
 */

import { sequelize } from "./models/db.js";

async function createAttachmentsTable() {
  try {
    await sequelize.authenticate();
    console.log("✅ Connected to MySQL database!");

    // Create attachments table
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS attachments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        requestId INT NOT NULL,
        fileName VARCHAR(255) NOT NULL,
        originalName VARCHAR(255) NOT NULL,
        fileType VARCHAR(100) NOT NULL,
        fileSize INT NOT NULL,
        filePath VARCHAR(500) NOT NULL,
        description TEXT,
        uploadedBy VARCHAR(255) NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (requestId) REFERENCES civil_requests(id) ON DELETE CASCADE
      )
    `;

    await sequelize.query(createTableQuery);
    console.log("✅ Attachments table created successfully!");
    
  } catch (err) {
    console.error("❌ Migration failed:", err);
  } finally {
    await sequelize.close();
    process.exit();
  }
}

createAttachmentsTable();