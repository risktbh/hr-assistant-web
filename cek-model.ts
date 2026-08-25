import 'dotenv/config';

async function cekModel() {
  console.log("Menghubungi server Google...");
  const apiKey = process.env.GOOGLE_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    console.log("\nModel Embedding yang tersedia untuk API Key kamu:");
    const embedModels = data.models.filter((m: any) => 
      m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent')
    );
    
    if (embedModels.length === 0) {
      console.log("❌ Tidak ada model embedding yang tersedia.");
    } else {
      embedModels.forEach((m: any) => console.log(`✅ ${m.name}`));
    }
  } catch (error) {
    console.error("Gagal mengambil data:", error);
  }
}

cekModel();