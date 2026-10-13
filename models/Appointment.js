import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const Appointment = sequelize.define("Appointment", {
  requestId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'civil_requests',
      key: 'id'
    }
  },
  fullName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: { isEmail: true }
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: false
  },
  region: {
    type: DataTypes.STRING,
    allowNull: false
  },
  documentType: {
    type: DataTypes.ENUM("birth", "marriage", "death", "id", "other"),
    allowNull: false
  },
  relationship: {
    type: DataTypes.STRING,
    allowNull: false
  },
  givenName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  middleName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  familyName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  birthdate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  fatherName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  motherName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  appointmentDate: {
    type: DataTypes.DATE,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM("scheduled", "confirmed", "completed", "cancelled", "rescheduled"),
    allowNull: false,
    defaultValue: "scheduled"
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: "appointments",
  timestamps: true
});

export { sequelize };