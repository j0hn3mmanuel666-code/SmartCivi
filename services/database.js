import bcrypt from "bcrypt";
import { DataTypes } from "sequelize";
import { DocumentCategory, DocumentRequest, StatusHistory } from "../models/documentModel.js";
import { User, sequelize } from "../models/userModel.js";

let databaseReady;

const defaultCategories = [
  { name: "Birth Certificate", description: "Certified copy of a registered birth record.", requirements: "Valid government-issued ID; proof of relationship for requests made on another person's behalf." },
  { name: "Marriage Certificate", description: "Certified copy of a registered marriage record.", requirements: "Valid government-issued ID; proof of relationship when applicable." },
  { name: "Death Certificate", description: "Certified copy of a registered death record.", requirements: "Valid government-issued ID; proof of relationship when applicable." },
  { name: "Certificate of No Marriage", description: "Certification of no recorded marriage.", requirements: "Valid government-issued ID and complete applicant details." },
];

export const ensureDatabase = async () => {
  if (!databaseReady) {
    databaseReady = (async () => {
      await sequelize.authenticate();
      await sequelize.sync();
      const requestColumns = await sequelize.getQueryInterface().describeTable(DocumentRequest.getTableName());
      if (!requestColumns.certificateDate) {
        await sequelize.getQueryInterface().addColumn(DocumentRequest.getTableName(), "certificateDate", {
          type: DataTypes.DATEONLY,
          allowNull: true,
        });
      }
      if (!requestColumns.applicantDateOfBirth) {
        await sequelize.getQueryInterface().addColumn(DocumentRequest.getTableName(), "applicantDateOfBirth", {
          type: DataTypes.DATEONLY,
          allowNull: true,
        });
      }
      if (!requestColumns.applicantId.allowNull) {
        await sequelize.getQueryInterface().changeColumn(DocumentRequest.getTableName(), "applicantId", {
          type: DataTypes.INTEGER,
          allowNull: true,
        });
      }
      const historyColumns = await sequelize.getQueryInterface().describeTable(StatusHistory.getTableName());
      if (!historyColumns.changedById.allowNull) {
        await sequelize.getQueryInterface().changeColumn(StatusHistory.getTableName(), "changedById", {
          type: DataTypes.INTEGER,
          allowNull: true,
        });
      }
      const usersTable = User.getTableName();
      const userColumns = await sequelize.getQueryInterface().describeTable(usersTable);
      if (!userColumns.contactInfo) {
        await sequelize.getQueryInterface().addColumn(usersTable, "contactInfo", {
          type: DataTypes.STRING(80),
          allowNull: true,
        });
      }
      if (!userColumns.accountStatus) {
        await sequelize.getQueryInterface().addColumn(usersTable, "accountStatus", {
          type: DataTypes.ENUM("active", "suspended"),
          allowNull: false,
          defaultValue: "active",
        });
      }
      if (!userColumns.role) {
        await sequelize.getQueryInterface().addColumn(usersTable, "role", {
          type: DataTypes.ENUM("admin", "staff", "applicant", "visitors"),
          allowNull: false,
          defaultValue: "applicant",
        });
      } else if (!userColumns.role.type.includes("'applicant'")) {
        await sequelize.getQueryInterface().changeColumn(usersTable, "role", {
          type: DataTypes.ENUM("admin", "staff", "applicant", "visitors"),
          allowNull: false,
          defaultValue: "applicant",
        });
      }

      for (const category of defaultCategories) {
        await DocumentCategory.findOrCreate({
          where: { name: category.name },
          defaults: category,
        });
      }

      const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
      if (Boolean(ADMIN_EMAIL) !== Boolean(ADMIN_PASSWORD)) {
        throw new Error("Set both ADMIN_EMAIL and ADMIN_PASSWORD to create the initial administrator.");
      }
      if (ADMIN_EMAIL && ADMIN_PASSWORD) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ADMIN_EMAIL) || ADMIN_PASSWORD.length < 8 || ADMIN_PASSWORD.length > 72) {
          throw new Error("Initial administrator credentials require a valid email and an 8-72 character password.");
        }
        const [admin, created] = await User.unscoped().findOrCreate({
          where: { email: ADMIN_EMAIL.trim().toLowerCase() },
          defaults: {
            name: ADMIN_NAME || "DocuTrack Administrator",
            email: ADMIN_EMAIL.trim().toLowerCase(),
            password: await bcrypt.hash(ADMIN_PASSWORD, 12),
            role: "admin",
            accountStatus: "active",
          },
        });
        if (created) console.log(`Created initial administrator: ${admin.email}`);
      }
    })();
  }

  try {
    await databaseReady;
  } catch (error) {
    databaseReady = null;
    throw error;
  }
};

export { sequelize };
