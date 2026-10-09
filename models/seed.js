import bcrypt from 'bcrypt';
import { User, Profile, Role, Permission, RolePermission, UserRole, AuditLog, Barangay, Resident } from './index.js';

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

    // Seed barangays and residents
    await seedBarangays();
    await seedResidents();

    console.log('✓ Seed completed successfully!');
  } catch (error) {
    console.error('❌ Seed error:', error.message);
    throw error;
  }
}

export async function seedBarangays() {
  try {
    console.log('🌱 Seeding barangays...');
    
    const barangayNames = [
      'Poblacion',
      'Caloocan',
      'Cabulao',
      'Carunog',
      'Cawayan',
      'Ipil',
      'Mamburao',
      'Mansalay',
      'Olandoy',
      'Panaluran',
      'Pinamalayan',
      'Pindasan',
      'Rosario',
      'Salogon',
      'Talusan',
      'Tigbao',
      'Tinahak',
      'Tiniguiban'
    ];

    for (const name of barangayNames) {
      await Barangay.findOrCreate({
        where: { name },
        defaults: {
          name,
          description: `Barangay ${name}, Municipality of Bansud, Oriental Mindoro`
        }
      });
    }

    console.log(`✓ Created ${barangayNames.length} barangays`);
  } catch (error) {
    console.error('❌ Barangay seeding error:', error.message);
    throw error;
  }
}

export async function seedResidents() {
  try {
    console.log('🌱 Seeding residents...');

    // Get all barangays
    const barangays = await Barangay.findAll();
    if (barangays.length === 0) {
      throw new Error('No barangays found. Seed barangays first.');
    }

    const poblacionBgy = barangays.find(b => b.name === 'Poblacion');
    const mamburao = barangays.find(b => b.name === 'Mamburao');
    const otherBgy = barangays.filter(b => b.name !== 'Poblacion' && b.name !== 'Mamburao');

    // Sample residents data
    const residentsData = [
      { first_name: 'Juan', middle_name: 'dela', last_name: 'Cruz', birthdate: '1985-03-15', sex: 'Male', civil_status: 'Married', address: 'Purok 1, Poblacion', barangay_id: poblacionBgy.id, contact_number: '09123456789', email: 'juan.delacruz@email.com', status: 'active' },
      { first_name: 'Maria', middle_name: 'Santos', last_name: 'Reyes', birthdate: '1990-07-22', sex: 'Female', civil_status: 'Single', address: 'Purok 2, Poblacion', barangay_id: poblacionBgy.id, contact_number: '09198765432', email: 'maria.reyes@email.com', status: 'active' },
      { first_name: 'Pedro', middle_name: 'Lopez', last_name: 'Fernandez', birthdate: '1978-11-08', sex: 'Male', civil_status: 'Widowed', address: 'Purok 3, Poblacion', barangay_id: poblacionBgy.id, contact_number: '09156789012', email: 'pedro.fernandez@email.com', status: 'active' },
      { first_name: 'Rosa', middle_name: 'Garcia', last_name: 'Mercado', birthdate: '1995-05-30', sex: 'Female', civil_status: 'Single', address: 'Purok 4, Poblacion', barangay_id: poblacionBgy.id, contact_number: '09187654321', email: 'rosa.mercado@email.com', status: 'archived' },
      { first_name: 'Carlos', middle_name: 'Villanueva', last_name: 'Gomez', birthdate: '1988-09-12', sex: 'Male', civil_status: 'Married', address: 'Purok 5, Poblacion', barangay_id: poblacionBgy.id, contact_number: '09145678901', email: 'carlos.gomez@email.com', status: 'active' },
      { first_name: 'Lucia', middle_name: 'Torres', last_name: 'Rivera', birthdate: '1992-01-25', sex: 'Female', civil_status: 'Married', address: 'Purok 1, Mamburao', barangay_id: mamburao.id, contact_number: '09112345678', email: 'lucia.rivera@email.com', status: 'active' },
      { first_name: 'Miguel', middle_name: 'Morales', last_name: 'Castillo', birthdate: '1980-06-18', sex: 'Male', civil_status: 'Single', address: 'Purok 2, Mamburao', barangay_id: mamburao.id, contact_number: '09134567890', email: 'miguel.castillo@email.com', status: 'active' },
      { first_name: 'Ana', middle_name: 'Flores', last_name: 'Campos', birthdate: '1998-04-10', sex: 'Female', civil_status: 'Single', address: 'Purok 3, Mamburao', barangay_id: mamburao.id, contact_number: '09176543210', email: 'ana.campos@email.com', status: 'active' },
      { first_name: 'Ricardo', middle_name: 'Ramos', last_name: 'Santos', birthdate: '1986-12-03', sex: 'Male', civil_status: 'Married', address: 'Purok 4, Mamburao', barangay_id: mamburao.id, contact_number: '09123098765', email: 'ricardo.santos@email.com', status: 'active' },
      { first_name: 'Francisca', middle_name: 'Medina', last_name: 'Aguilar', birthdate: '1993-08-20', sex: 'Female', civil_status: 'Separated', address: 'Purok 5, Mamburao', barangay_id: mamburao.id, contact_number: '09165432109', email: 'francisca.aguilar@email.com', status: 'archived' },
      { first_name: 'Fernando', middle_name: 'Navarro', last_name: 'Delgado', birthdate: '1981-02-14', sex: 'Male', civil_status: 'Married', address: 'Purok 1, Ipil', barangay_id: otherBgy[0].id, contact_number: '09154321098', email: 'fernando.delgado@email.com', status: 'active' },
      { first_name: 'Isabel', middle_name: 'Herrera', last_name: 'Valenzuela', birthdate: '1997-10-05', sex: 'Female', civil_status: 'Single', address: 'Purok 2, Rosario', barangay_id: otherBgy[1]?.id || otherBgy[0].id, contact_number: '09143210987', email: 'isabel.valenzuela@email.com', status: 'active' },
      { first_name: 'Antonio', middle_name: 'Vargas', last_name: 'Ortega', birthdate: '1984-07-11', sex: 'Male', civil_status: 'Single', address: 'Purok 1, Talusan', barangay_id: otherBgy[2]?.id || otherBgy[0].id, contact_number: '09132109876', email: 'antonio.ortega@email.com', status: 'active' },
      { first_name: 'Dolores', middle_name: 'Ruiz', last_name: 'Fuentes', birthdate: '1991-09-28', sex: 'Female', civil_status: 'Married', address: 'Purok 2, Tigbao', barangay_id: otherBgy[3]?.id || otherBgy[0].id, contact_number: '09121098765', email: 'dolores.fuentes@email.com', status: 'active' },
      { first_name: 'Alejandro', middle_name: 'Soto', last_name: 'Herrera', birthdate: '1989-03-17', sex: 'Male', civil_status: 'Married', address: 'Purok 1, Pindasan', barangay_id: otherBgy[4]?.id || otherBgy[0].id, contact_number: '09110987654', email: 'alejandro.herrera@email.com', status: 'active' }
    ];

    let residentCount = 0;
    for (let i = 0; i < residentsData.length; i++) {
      const resident = residentsData[i];
      const residentId = `BSD-2026-${String(i + 1).padStart(5, '0')}`;
      
      await Resident.findOrCreate({
        where: { resident_id: residentId },
        defaults: {
          resident_id: residentId,
          ...resident
        }
      });
      residentCount++;
    }

    console.log(`✓ Created ${residentCount} residents`);
  } catch (error) {
    console.error('❌ Resident seeding error:', error.message);
    throw error;
  }
}
