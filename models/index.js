import { sequelize } from "./db.js";
import { User } from "./User.js";
import { Profile } from "./Profile.js";
import { Role } from "./Role.js";
import { Permission } from "./Permission.js";
import { RolePermission } from "./RolePermission.js";
import { UserRole } from "./UserRole.js";
import { AuditLog } from "./AuditLog.js";
import { Barangay } from "./Barangay.js";
import { Resident } from "./Resident.js";
import { ResidentActivity } from "./ResidentActivity.js";

// Define associations
User.hasOne(Profile, { foreignKey: 'user_id', onDelete: 'CASCADE' });
Profile.belongsTo(User, { foreignKey: 'user_id' });

User.belongsToMany(Role, { through: UserRole, foreignKey: 'user_id', otherKey: 'role_id' });
Role.belongsToMany(User, { through: UserRole, foreignKey: 'role_id', otherKey: 'user_id' });

Role.belongsToMany(Permission, { through: RolePermission, foreignKey: 'role_id', otherKey: 'permission_id' });
Permission.belongsToMany(Role, { through: RolePermission, foreignKey: 'permission_id', otherKey: 'role_id' });

User.hasMany(AuditLog, { foreignKey: 'user_id' });
AuditLog.belongsTo(User, { foreignKey: 'user_id' });

// Resident RIMS associations
Barangay.hasMany(Resident, { foreignKey: 'barangay_id' });
Resident.belongsTo(Barangay, { foreignKey: 'barangay_id' });

Resident.hasMany(ResidentActivity, { foreignKey: 'resident_id' });
ResidentActivity.belongsTo(Resident, { foreignKey: 'resident_id' });

ResidentActivity.belongsTo(User, { foreignKey: 'user_id' });
User.hasMany(ResidentActivity, { foreignKey: 'user_id' });

export { sequelize, User, Profile, Role, Permission, RolePermission, UserRole, AuditLog, Barangay, Resident, ResidentActivity };

export async function syncAll() {
  return await sequelize.sync({ alter: true });
}
