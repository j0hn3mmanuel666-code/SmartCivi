import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const Resident = sequelize.define("Resident", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  resident_id: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  first_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  middle_name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  last_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  birthdate: {
    type: DataTypes.DATE,
    allowNull: false
  },
  sex: {
    type: DataTypes.ENUM('Male', 'Female'),
    allowNull: false
  },
  civil_status: {
    type: DataTypes.ENUM('Single', 'Married', 'Widowed', 'Separated', 'Annulled'),
    allowNull: false
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  barangay_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'barangays',
      key: 'id'
    }
  },
  contact_number: {
    type: DataTypes.STRING,
    allowNull: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('active', 'archived'),
    allowNull: false,
    defaultValue: 'active'
  }
}, {
  timestamps: true,
  tableName: 'residents'
});
