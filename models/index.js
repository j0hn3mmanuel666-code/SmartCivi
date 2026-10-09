import { sequelize } from "./db.js";
import { StaffUser } from "./StaffUser.js";
import { Barangay } from "./Barangay.js";
import { Resident } from "./Resident.js";
import { ResidentActivity } from "./ResidentActivity.js";

// Resident RIMS associations
Barangay.hasMany(Resident, { foreignKey: 'barangay_id' });
Resident.belongsTo(Barangay, { foreignKey: 'barangay_id' });

Resident.hasMany(ResidentActivity, { foreignKey: 'resident_id' });
ResidentActivity.belongsTo(Resident, { foreignKey: 'resident_id' });

ResidentActivity.belongsTo(StaffUser, { foreignKey: 'user_id', as: 'staff' });
StaffUser.hasMany(ResidentActivity, { foreignKey: 'user_id' });

export { sequelize, StaffUser, Barangay, Resident, ResidentActivity };

export async function syncAll() {
  return await sequelize.sync({ alter: true });
}
