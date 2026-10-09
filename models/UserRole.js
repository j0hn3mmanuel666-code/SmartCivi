import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const UserRole = sequelize.define("UserRole", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  role_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'roles',
      key: 'id'
    }
  }
}, {
  timestamps: false,
  tableName: 'user_roles',
  indexes: [
    {
      unique: true,
      fields: ['user_id', 'role_id']
    }
  ]
});
