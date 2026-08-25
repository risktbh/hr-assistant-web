import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export async function GET(req: Request) {
  try {
    // Mengambil riwayat sesi obrolan, diurutkan dari yang paling baru
    // (Sementara kita hardcode userId "riski" sesuai dengan di sidebar)
    const sessions = await prisma.chatSession.findMany({
      where: {
        userId: 'riski'
      },
      orderBy: {
        updatedAt: 'desc'
      },
      take: 15 // Batasi hanya menampilkan 15 riwayat terakhir agar sidebar tidak kepanjangan
    });

    return new Response(JSON.stringify(sessions), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error("💥 ERROR FETCH SESSIONS:", error);
    return new Response(JSON.stringify({ error: "Gagal mengambil data riwayat chat." }), { status: 500 });
  }
}