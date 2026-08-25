import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Catatan: Di Next.js 15+, params adalah sebuah Promise
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Ajaibnya Prisma: Karena kita mengatur onDelete: Cascade di schema,
    // menghapus dokumen induk ini akan OTOMATIS menghancurkan semua vektor chunk miliknya!
    await prisma.document.delete({
      where: { id },
    });

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    console.error("Error menghapus dokumen:", error);
    return new Response(JSON.stringify({ error: "Gagal menghapus dokumen" }), { status: 500 });
  }
}