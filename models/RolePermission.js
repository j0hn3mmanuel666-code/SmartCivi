import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const RolePermission = sequelize.define("RolePermission", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  role_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'roles',
      key: 'id'
    }
  },
  permission_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'permissions',
      key: 'id'
    }
  }
}, {
  timestamps: false,
  tableName: 'role_permissions',
  indexes: [
    {
      unique: true,
      fields: ['role_id', 'permission_id']
    }
  ]
});
