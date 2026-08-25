import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// API UNTUK MENGAMBIL SELURUH PESAN DARI 1 SESI
// Perhatikan: tipe params sekarang adalah Promise
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Gunakan await sebelum mendestrukturisasi params
    const { id } = await params; 
    
    const messages = await prisma.chatMessage.findMany({
      where: { sessionId: id },
      orderBy: { createdAt: 'asc' } // Urutkan dari yang paling lama ke terbaru
    });
    
    return new Response(JSON.stringify(messages), { status: 200 });
  } catch (error) {
    console.error("Gagal mengambil pesan:", error);
    return new Response(JSON.stringify({ error: "Gagal memuat pesan" }), { status: 500 });
  }
}

// API UNTUK MENGHAPUS SESI
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Gunakan await sebelum mendestrukturisasi params
    const { id } = await params;
    
    // Berkat onDelete: Cascade di schema.prisma, menghapus session otomatis menghapus semua pesannya
    await prisma.chatSession.delete({
      where: { id: id }
    });
    
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    console.error("Gagal menghapus sesi:", error);
    return new Response(JSON.stringify({ error: "Gagal menghapus sesi" }), { status: 500 });
  }
}