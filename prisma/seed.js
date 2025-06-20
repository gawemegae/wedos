const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create default app settings
  const defaultSettings = [
    { key: 'app_name', value: 'StreamHib', type: 'string' },
    { key: 'app_version', value: '2.0.0', type: 'string' },
    { key: 'max_concurrent_streams', value: '5', type: 'number' },
    { key: 'max_video_size_mb', value: '500', type: 'number' },
    { key: 'allowed_video_formats', value: '["mp4","mkv","avi","mov","webm","flv"]', type: 'json' },
    { key: 'default_stream_platform', value: 'YouTube', type: 'string' },
    { key: 'session_timeout_hours', value: '12', type: 'number' },
    { key: 'auto_cleanup_inactive_days', value: '30', type: 'number' },
    { key: 'enable_email_notifications', value: 'true', type: 'boolean' },
    { key: 'enable_trial_mode', value: 'false', type: 'boolean' }
  ];

  for (const setting of defaultSettings) {
    await prisma.appSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting
    });
  }

  console.log('✅ Default app settings created');

  // Create sample admin user (optional - only if no users exist)
  const userCount = await prisma.user.count();
  
  if (userCount === 0) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    const adminUser = await prisma.user.create({
      data: {
        username: 'admin',
        email: 'admin@streamhib.local',
        password: hashedPassword
      }
    });

    console.log('✅ Sample admin user created:');
    console.log('   Username: admin');
    console.log('   Email: admin@streamhib.local');
    console.log('   Password: admin123');
    console.log('   ⚠️  Please change this password after first login!');
  } else {
    console.log('ℹ️  Users already exist, skipping admin user creation');
  }

  // Log initial system startup
  await prisma.systemLog.create({
    data: {
      level: 'info',
      message: 'Database seeded successfully',
      meta: JSON.stringify({
        timestamp: new Date().toISOString(),
        action: 'database_seed',
        settings_count: defaultSettings.length,
        user_count: await prisma.user.count()
      })
    }
  });

  console.log('✅ Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });