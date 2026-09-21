import * as bcrypt from 'bcrypt';
import { AppDataSource } from '../src/config/typeorm.datasource';
import { AppUserEntity } from '../src/modules/auth/entities/app-user.entity';
import { UserRoleEntity } from '../src/modules/auth/entities/user-role.entity';
import { ADMIN_ROLES, RoleName } from '../src/common/constants/roles.enum';

function argument(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const email = argument('email')?.trim().toLowerCase();
  const password = argument('password');
  const requestedRole = (argument('role') ?? RoleName.OPERATIONS_ADMIN) as RoleName;

  if (!email || !password || password.length < 12) {
    throw new Error('Usage: npm run admin:create -- --email admin@example.com --password "minimum-12-chars" [--role OPERATIONS_ADMIN]');
  }
  if (!ADMIN_ROLES.includes(requestedRole)) {
    throw new Error(`Role must be one of: ${ADMIN_ROLES.join(', ')}`);
  }

  await AppDataSource.initialize();
  try {
    const userRepo = AppDataSource.getRepository(AppUserEntity);
    const roleRepo = AppDataSource.getRepository(UserRoleEntity);
    const now = new Date();
    let user = await userRepo.findOne({ where: { email } });
    const passwordHash = await bcrypt.hash(password, 12);

    if (!user) {
      user = userRepo.create({ email, passwordHash, locale: 'az', isActive: true, createdAt: now, updatedAt: now });
    } else {
      user.passwordHash = passwordHash;
      user.isActive = true;
      user.updatedAt = now;
    }
    const saved = await userRepo.save(user);
    const existingRole = await roleRepo.findOne({ where: { userId: saved.id, role: requestedRole } });
    if (!existingRole) {
      await roleRepo.save(roleRepo.create({ userId: saved.id, role: requestedRole, providerId: null, createdAt: now }));
    }
    console.log(`Admin account ready: ${email} (${requestedRole})`);
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
