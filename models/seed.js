import bcrypt from 'bcrypt';
import { User, Profile, Role, Permission, RolePermission, UserRole, AuditLog } from './index.js';

export async function seedData() {
  try {
    console.log('🌱 Starting database seed...');

    // Create Permissions
    const permissions = [
      'view_dashboard',
      'view_own_profile',
      'edit_own_profile',
      'change_own_password',
      'view_all_users',
      'add_user',
      'edit_user',
      'assign_role',
      'activate_deactivate_user',
      'reset_user_password',
      'view_audit_logs',
      'manage_permissions'
    ];

    const permissionRecords = [];
    for (const perm of permissions) {
      const [permRecord] = await Permission.findOrCreate({
        where: { name: perm },
        defaults: { name: perm, description: `Permission to ${perm.replace(/_/g, ' ')}` }
      });
      permissionRecords.push(permRecord);
    }
    console.log(`✓ Created ${permissionRecords.length} permissions`);

    // Create Roles
    const [adminRole] = await Role.findOrCreate({
      where: { name: 'Administrator' },
      defaults: {
        name: 'Administrator',
        description: 'Full system access'
      }
    });

    const [staffRole] = await Role.findOrCreate({
      where: { name: 'LGU Staff' },
      defaults: {
        name: 'LGU Staff',
        description: 'Limited administrative access'
      }
    });

    const [residentRole] = await Role.findOrCreate({
      where: { name: 'Resident' },
      defaults: {
        name: 'Resident',
        description: 'Personal account access only'
      }
    });
    console.log('✓ Created 3 roles');

    // Assign permissions to roles
    // Admin gets all permissions
    const adminPerms = await Permission.findAll();
    for (const perm of adminPerms) {
      await RolePermission.findOrCreate({
        where: { role_id: adminRole.id, permission_id: perm.id },
        defaults: { role_id: adminRole.id, permission_id: perm.id }
      });
    }

    // Staff and Resident get limited permissions
    const staffPermissions = ['view_dashboard', 'view_own_profile', 'edit_own_profile', 'change_own_password'];
    for (const permName of staffPermissions) {
      const perm = await Permission.findOne({ where: { name: permName } });
      if (perm) {
        await RolePermission.findOrCreate({
          where: { role_id: staffRole.id, permission_id: perm.id },
          defaults: { role_id: staffRole.id, permission_id: perm.id }
        });
        await RolePermission.findOrCreate({
          where: { role_id: residentRole.id, permission_id: perm.id },
          defaults: { role_id: residentRole.id, permission_id: perm.id }
        });
      }
    }
    console.log('✓ Assigned permissions to roles');

    // Create Users
    // Admin user
    const adminPasswordHash = await bcrypt.hash('Admin@2026!', 12);
    const [admin] = await User.findOrCreate({
      where: { username: 'admin' },
      defaults: {
        username: 'admin',
        email: 'admin@smartcivi.local',
        password_hash: adminPasswordHash,
        status: 'active'
      }
    });

    // Admin profile
    await Profile.findOrCreate({
      where: { user_id: admin.id },
      defaults: {
        user_id: admin.id,
        first_name: 'System',
        middle_name: '',
        last_name: 'Administrator',
        contact_number: '',
        address: ''
      }
    });

    // Assign admin role to admin user
    await UserRole.findOrCreate({
      where: { user_id: admin.id, role_id: adminRole.id },
      defaults: { user_id: admin.id, role_id: adminRole.id }
    });

    // Staff user
    const staffPasswordHash = await bcrypt.hash('Staff@2026!', 12);
    const [staff] = await User.findOrCreate({
      where: { username: 'juan.delacruz' },
      defaults: {
        username: 'juan.delacruz',
        email: 'staff@smartcivi.local',
        password_hash: staffPasswordHash,
        status: 'active'
      }
    });

    await Profile.findOrCreate({
      where: { user_id: staff.id },
      defaults: {
        user_id: staff.id,
        first_name: 'Juan',
        middle_name: 'dela',
        last_name: 'Cruz',
        contact_number: '09123456789',
        address: 'Mamburao, Occidental Mindoro'
      }
    });

    await UserRole.findOrCreate({
      where: { user_id: staff.id, role_id: staffRole.id },
      defaults: { user_id: staff.id, role_id: staffRole.id }
    });

    // Resident user
    const residentPasswordHash = await bcrypt.hash('Resident@2026!', 12);
    const [resident] = await User.findOrCreate({
      where: { username: 'maria.santos' },
      defaults: {
        username: 'maria.santos',
        email: 'resident@smartcivi.local',
        password_hash: residentPasswordHash,
        status: 'active'
      }
    });

    await Profile.findOrCreate({
      where: { user_id: resident.id },
      defaults: {
        user_id: resident.id,
        first_name: 'Maria',
        middle_name: '',
        last_name: 'Santos',
        contact_number: '09987654321',
        address: 'San Jose, Occidental Mindoro'
      }
    });

    await UserRole.findOrCreate({
      where: { user_id: resident.id, role_id: residentRole.id },
      defaults: { user_id: resident.id, role_id: residentRole.id }
    });

    console.log('✓ Created 3 demo users');

    // Create system seed audit log
    await AuditLog.create({
      user_id: null,
      action: 'SYSTEM_SEED',
      description: 'Demo data seeded',
      ip_address: 'localhost'
    });

    console.log('✓ Seed completed successfully!');
  } catch (error) {
    console.error('❌ Seed error:', error.message);
    throw error;
  }
}
