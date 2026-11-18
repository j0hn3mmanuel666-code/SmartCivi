import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const Notification = sequelize.define("Notification", {
  audience: {
    type: DataTypes.ENUM("admin", "user", "all"),
    allowNull: false
  },
  recipientEmail: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: { isEmail: true }
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  requestId: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  tableName: "notifications",
  timestamps: true
});
