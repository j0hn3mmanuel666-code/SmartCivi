import mysql from "mysql2/promise";
import { ensureDatabase } from "./services/database.js";
import { sequelize } from "./models/db.js";

const database = process.env.DB_NAME || "DocuTrack-Final";
if (!/^[A-Za-z0-9_-]+$/.test(database)) {
  throw new Error("DB_NAME may contain only letters, numbers, underscores, and hyphens.");
}

let connection;
try {
  connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    connectTimeout: 10000,
  });
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await connection.end();
  connection = null;
  await ensureDatabase();
  console.log(`DocuTrack MySQL schema is ready in database "${database}".`);
} catch (error) {
  const causes = Array.isArray(error.errors) ? error.errors : [error];
  const details = causes
    .map((cause) => [cause.code, cause.message].filter(Boolean).join(": "))
    .filter(Boolean)
    .join("; ");
  console.error("MySQL migration failed:", details || error.stack || String(error));
  process.exitCode = 1;
} finally {
  if (connection) await connection.end();
  await sequelize.close();
}
