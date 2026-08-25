import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export async function GET() {
  try {
    // 1. Hitung total dokumen induk
    const totalDocuments = await prisma.document.count();

    // 2. Hitung total potongan vektor (knowledge chunks)
    const totalChunks = await prisma.documentChunk.count();

    // 3. Ambil 4 dokumen PDF terbaru yang diunggah
    const recentDocuments = await prisma.document.findMany({
      orderBy: { createdAt: 'desc' },
      take: 4,
      select: { 
        id: true, 
        filename: true,
        _count: {
          select: { chunks: true } // Menghitung jumlah vektor per dokumen
        }
      }
    });

    return new Response(JSON.stringify({ 
      totalDocuments, 
      totalChunks, 
      recentDocuments 
    }), { status: 200 });

  } catch (error) {
    console.error("Error mengambil data dashboard:", error);
    return new Response(JSON.stringify({ error: "Gagal mengambil data" }), { status: 500 });
  }
}