import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
// @ts-ignore
import PDFParser from 'pdf2json';

// Setup Koneksi Database
const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export async function POST(req: Request) {
  try {
    // 1. Menerima File PDF dari Frontend
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return new Response(JSON.stringify({ error: "File tidak ditemukan" }), { status: 400 });
    }

    console.log(`Mulai memproses file: ${file.name}`);

    // 2. Ekstrak Teks dari PDF menggunakan pdf2json (Aman dari Web Worker / Turbopack)
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const rawText = await new Promise<string>((resolve, reject) => {
        const pdfParser = new PDFParser(null, true);
        
        pdfParser.on("pdfParser_dataError", (errData: any) => reject(errData.parserError));
        pdfParser.on("pdfParser_dataReady", () => {
            resolve(pdfParser.getRawTextContent());
        });
        
        pdfParser.parseBuffer(buffer);
    });

    if (!rawText || rawText.trim() === '') {
        throw new Error("Teks PDF kosong atau tidak bisa terbaca");
    }

    // 3. Memecah Teks menjadi Chunks Kecil (LangChain)
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const docs = await textSplitter.createDocuments([rawText]);

    // 4. Menyimpan Judul Dokumen Induk ke Database
    const newDocument = await prisma.document.create({
      data: {
        filename: file.name,
      },
    });

    // 5. Vektorisasi dengan Gemini dan Menyimpan Chunks
    const embeddings = new GoogleGenerativeAIEmbeddings({
      model: "gemini-embedding-2",
    });

    console.log(`Menyimpan ${docs.length} vektor ke database...`);
    
    // Looping setiap potongan teks
    for (const doc of docs) {
      const vector = await embeddings.embedQuery(doc.pageContent);
      const vectorString = `[${vector.join(',')}]`;

      await prisma.$executeRaw`
        INSERT INTO "DocumentChunk" (id, content, metadata, embedding, "documentId", "createdAt")
        VALUES (
          gen_random_uuid(), 
          ${doc.pageContent}, 
          ${JSON.stringify({ source: file.name })}::jsonb, 
          ${vectorString}::vector, 
          ${newDocument.id}, 
          NOW()
        )
      `;
    }
    
    console.log("Upload dan vektorisasi selesai!");
    return new Response(JSON.stringify({ success: true, documentId: newDocument.id }), { status: 200 });

  } catch (error) {
    console.error("Error saat mengunggah PDF:", error);
    return new Response(JSON.stringify({ error: "Gagal memproses dokumen" }), { status: 500 });
  }
}

export async function GET() {
  try {
    // Mengambil semua dokumen, diurutkan dari yang terbaru
    const documents = await prisma.document.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        filename: true,
        createdAt: true,
      }
    });

    return new Response(JSON.stringify({ documents }), { status: 200 });
  } catch (error) {
    console.error("Error mengambil dokumen:", error);
    return new Response(JSON.stringify({ error: "Gagal mengambil data" }), { status: 500 });
  }
}