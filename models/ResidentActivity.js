import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const ResidentActivity = sequelize.define("ResidentActivity", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  resident_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'residents',
      key: 'id'
    }
  },
  action: {
    type: DataTypes.ENUM('created', 'updated', 'archived', 'restored'),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  }
}, {
  timestamps: true,
  updatedAt: false,
  tableName: 'resident_activities'
});
