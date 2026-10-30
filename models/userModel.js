import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const User = sequelize.define("User", {
  name: { type: DataTypes.STRING(120), allowNull: false },
  email: { type: DataTypes.STRING(190), allowNull: false, unique: true, validate: { isEmail: true } },
  password: { type: DataTypes.STRING(255), allowNull: false },
  role: {
    type: DataTypes.ENUM("admin", "staff", "applicant", "visitors"),
    allowNull: false,
    defaultValue: "staff",
  },
  accountStatus: {
    type: DataTypes.ENUM("active", "suspended"),
    allowNull: false,
    defaultValue: "active",
  },
  contactInfo: { type: DataTypes.STRING(80), allowNull: true },
}, {
  defaultScope: { attributes: { exclude: ["password"] } },
});

export { sequelize };
