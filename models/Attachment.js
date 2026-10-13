import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const Attachment = sequelize.define("Attachment", {
  requestId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'civil_requests',
      key: 'id'
    }
  },
  fileName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  originalName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  fileType: {
    type: DataTypes.STRING,
    allowNull: false
  },
  fileSize: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  filePath: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  uploadedBy: {
    type: DataTypes.STRING,
    allowNull: false
  }
}, {
  tableName: "attachments",
  timestamps: true
});

export { sequelize };