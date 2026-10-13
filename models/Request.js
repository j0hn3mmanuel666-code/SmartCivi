import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const Request = sequelize.define(
  "Request",
  {
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
