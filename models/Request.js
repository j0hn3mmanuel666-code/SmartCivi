import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const Request = sequelize.define(
  "Request",
  {
    residentId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'residents', key: 'id' } },
    recordId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'civil_records', key: 'id' } },
    assignee: { type: DataTypes.STRING, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    appointmentDate: { type: DataTypes.DATE, allowNull: true },
    appointmentStatus: { type: DataTypes.STRING(30), allowNull: true },
    rescheduleReason: { type: DataTypes.TEXT, allowNull: true },
    rescheduleRequested: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    fullName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { isEmail: true },
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    documentType: {
      type: DataTypes.ENUM("birth", "marriage", "death"),
      allowNull: false,
    },
    purpose: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "Pending",
    },
    paymentMethod: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    paidAt: { type: DataTypes.DATE, allowNull: true },
    paymentReference: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    paymentAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
  },
  {
    tableName: "civil_requests", // 👈 your custom table name
    timestamps: true, // optional: adds createdAt and updatedAt
  }
);

export { sequelize };
