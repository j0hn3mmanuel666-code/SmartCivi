import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";
import { User } from "./userModel.js";

export const DocumentCategory = sequelize.define("DocumentCategory", {
  name: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  description: { type: DataTypes.STRING(500), allowNull: false, defaultValue: "" },
  requirements: { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
});

export const DocumentRequest = sequelize.define("DocumentRequest", {
  referenceNo: { type: DataTypes.STRING(32), allowNull: false, unique: true },
  documentType: { type: DataTypes.STRING(100), allowNull: false },
  applicantName: { type: DataTypes.STRING(120), allowNull: false },
  applicantDateOfBirth: { type: DataTypes.DATEONLY, allowNull: true },
  certificateDate: { type: DataTypes.DATEONLY, allowNull: true },
  contactEmail: { type: DataTypes.STRING(190), allowNull: false },
  contactInfo: { type: DataTypes.STRING(80), allowNull: false },
  purpose: { type: DataTypes.TEXT, allowNull: false, defaultValue: "", field: "details" },
  attachmentPath: { type: DataTypes.STRING(500), allowNull: true },
  originalFileName: { type: DataTypes.STRING(255), allowNull: true },
  status: {
    type: DataTypes.ENUM(
      "Submitted",
      "Under Review",
      "Correction Requested",
      "Approved",
      "Rejected",
      "Ready for Release",
      "Released",
    ),
    allowNull: false,
    defaultValue: "Submitted",
  },
  assignedStaffId: { type: DataTypes.INTEGER, allowNull: true },
});

export const DocumentRecord = sequelize.define("DocumentRecord", {
  referenceNo: { type: DataTypes.STRING(32), allowNull: false, unique: true },
  resultPath: { type: DataTypes.STRING(500), allowNull: true },
  releaseDate: { type: DataTypes.DATE, allowNull: true },
});

export const StatusHistory = sequelize.define("StatusHistory", {
  status: { type: DataTypes.STRING(40), allowNull: false },
  remarks: { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
});

export const Notification = sequelize.define("Notification", {
  message: { type: DataTypes.STRING(500), allowNull: false },
  readAt: { type: DataTypes.DATE, allowNull: true },
});

DocumentCategory.hasMany(DocumentRequest, { foreignKey: "categoryId", as: "requests" });
DocumentRequest.belongsTo(DocumentCategory, { foreignKey: "categoryId", as: "category" });
User.hasMany(DocumentRequest, { foreignKey: { name: "applicantId", allowNull: true }, as: "requests" });
DocumentRequest.belongsTo(User, { foreignKey: "applicantId", as: "applicant" });
User.hasMany(DocumentRequest, { foreignKey: "assignedStaffId", as: "assignedRequests" });
DocumentRequest.belongsTo(User, { foreignKey: "assignedStaffId", as: "assignedStaff" });
DocumentRequest.hasMany(StatusHistory, { foreignKey: { name: "requestId", allowNull: false }, as: "history" });
StatusHistory.belongsTo(DocumentRequest, { foreignKey: "requestId", as: "request" });
StatusHistory.belongsTo(User, { foreignKey: { name: "changedById", allowNull: true }, as: "changedBy" });
User.hasMany(Notification, { foreignKey: { name: "userId", allowNull: false }, as: "notifications" });
Notification.belongsTo(User, { foreignKey: "userId", as: "user" });
Notification.belongsTo(DocumentRequest, { foreignKey: "requestId", as: "request" });
DocumentRequest.hasOne(DocumentRecord, { foreignKey: { name: "requestId", allowNull: false }, as: "record" });
DocumentRecord.belongsTo(DocumentRequest, { foreignKey: "requestId", as: "request" });
