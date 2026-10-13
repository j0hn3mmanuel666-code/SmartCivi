import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

// Define the User model
export const User = sequelize.define("User", {
  name: { 
    type: DataTypes.STRING, 
    allowNull: false 
  },
  email: { 
    type: DataTypes.STRING, 
    allowNull: false,
    unique: true, // Prevents duplicate emails
    validate: {
      isEmail: true, // Ensures valid email format
    },
  },
  password: { 
    type: DataTypes.STRING, 
    allowNull: false 
  },
  role: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'user'
  }
}, {
  timestamps: true, // Adds createdAt and updatedAt fields
  tableName: "users", // Optional: Custom table name
});
