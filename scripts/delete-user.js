const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function deleteUser() {
  try {
    // Tampilkan semua user
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        createdAt: true
      }
    });

    console.log('📋 Daftar User:');
    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.username} (${user.email}) - ID: ${user.id}`);
    });

    if (users.length === 0) {
      console.log('❌ Tidak ada user yang ditemukan');
      return;
    }

    // Untuk demo, hapus user pertama (ganti sesuai kebutuhan)
    const userToDelete = users[0];
    
    console.log(`\n🗑️ Menghapus user: ${userToDelete.username} (${userToDelete.email})`);
    
    // Hapus user (akan otomatis hapus relasi karena onDelete: Cascade)
    await prisma.user.delete({
      where: {
        id: userToDelete.id
      }
    });

    console.log('✅ User berhasil dihapus!');
    
    // Tampilkan user yang tersisa
    const remainingUsers = await prisma.user.findMany();
    console.log(`\n📊 Sisa user: ${remainingUsers.length}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

// Jalankan jika dipanggil langsung
if (require.main === module) {
  deleteUser();
}

module.exports = deleteUser;