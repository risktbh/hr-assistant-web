'use client';

import { useState, useRef, useEffect } from 'react';
import { 
  UploadCloud, FileText, Trash2, AlertCircle, CheckCircle2, 
  Database, RefreshCw, Loader2, FileUp, Settings, HardDrive
} from 'lucide-react';

// Mendefinisikan tipe data untuk dokumen
type DocumentType = {
  id: string;
  filename: string;
  createdAt: string;
};

export default function AdminPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | ''; text: string }>({ type: '', text: '' });
  
  // State untuk tabel dokumen
  const [documents, setDocuments] = useState<DocumentType[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fungsi untuk mengambil daftar dokumen
  const fetchDocuments = async () => {
    setIsLoadingDocs(true);
    try {
      const res = await fetch('/api/documents');
      const data = await res.json();
      if (data.documents) {
        setDocuments(data.documents);
      }
    } catch (error) {
      console.error("Gagal mengambil daftar dokumen", error);
    } finally {
      setIsLoadingDocs(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  // --- Fungsi Upload ---
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type === 'application/pdf') {
        setFile(droppedFile);
        setStatusMessage({ type: '', text: '' });
      } else {
        setStatusMessage({ type: 'error', text: 'Format tidak didukung. Mohon unggah file PDF.' });
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setStatusMessage({ type: '', text: '' });
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setStatusMessage({ type: '', text: '' });

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Gagal mengunggah ke server');

      setStatusMessage({ type: 'success', text: 'Dokumen berhasil diproses dan masuk ke memori AI.' });
      setFile(null);
      
      fetchDocuments(); // Refresh tabel
    } catch (error) {
      console.error("Upload error:", error);
      setStatusMessage({ type: 'error', text: 'Terjadi kesalahan saat memproses dokumen.' });
    } finally {
      setIsUploading(false);
    }
  };

  // --- Fungsi Hapus ---
  const handleDelete = async (id: string, filename: string) => {
    const isConfirmed = window.confirm(`Hapus "${filename}" secara permanen?\nDokumen ini akan dihapus dari vektor memori AI.`);
    if (!isConfirmed) return;

    try {
      const response = await fetch(`/api/documents/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setDocuments(documents.filter((doc) => doc.id !== id));
      } else {
        alert("Gagal menghapus dokumen dari server.");
      }
    } catch (error) {
      console.error("Delete error:", error);
      alert("Terjadi kesalahan jaringan.");
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-gray-800">
      
      {/* Top Navigation / Header */}
      <nav className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg text-white">
            <Database size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 leading-tight">AI Knowledge Base</h1>
            <p className="text-xs text-gray-500">Kelola memori dokumen untuk HR Assistant</p>
          </div>
        </div>
        <a href="/" className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-lg border border-gray-200 hover:border-indigo-200">
          Kembali ke Chat
        </a>
      </nav>

      <main className="max-w-7xl mx-auto p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Kolom Kiri: Form Upload (Lebih sempit di layar besar) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Card Statistik Cepat (Opsional) */}
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-4">
             <div className="bg-emerald-100 p-3 rounded-full text-emerald-600">
               <HardDrive size={24} />
             </div>
             <div>
               <p className="text-sm text-gray-500 font-medium">Total Dokumen</p>
               <p className="text-2xl font-bold text-gray-900">{documents.length}</p>
             </div>
          </div>

          {/* Card Upload */}
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm relative overflow-hidden">
            {/* Dekorasi Background */}
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <UploadCloud size={120} />
            </div>

            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-1 relative z-10">
              <FileUp size={18} className="text-indigo-600"/>
              Unggah Dokumen Baru
            </h2>
            <p className="text-sm text-gray-500 mb-6 relative z-10">Format yang didukung: PDF. Maks 10MB.</p>
            
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative z-10 border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all duration-200 text-center group ${
                isUploading 
                  ? 'bg-gray-50 border-gray-300 cursor-not-allowed opacity-70' 
                  : file 
                    ? 'bg-indigo-50/50 border-indigo-400 hover:bg-indigo-50' 
                    : 'bg-white border-gray-300 hover:border-indigo-400 hover:bg-gray-50'
              }`}
            >
              <input type="file" accept=".pdf" ref={fileInputRef} onChange={handleFileSelect} className="hidden" disabled={isUploading} />
              
              {file ? (
                <>
                  <div className="bg-indigo-100 p-3 rounded-full text-indigo-600 mb-3 group-hover:scale-110 transition-transform">
                    <FileText size={24} />
                  </div>
                  <p className="text-indigo-900 font-semibold text-sm truncate w-full px-4">{file.name}</p>
                  <p className="text-indigo-500 text-xs mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </>
              ) : (
                <>
                  <div className="bg-gray-100 p-3 rounded-full text-gray-400 mb-3 group-hover:text-indigo-500 group-hover:bg-indigo-50 transition-colors">
                    <UploadCloud size={24} />
                  </div>
                  <p className="text-gray-700 font-medium text-sm">Klik untuk memilih file</p>
                  <p className="text-gray-400 text-xs mt-1">atau tarik dan lepas file di sini</p>
                </>
              )}
            </div>

            {/* Area Pesan Status */}
            {statusMessage.text && (
              <div className={`mt-4 p-3 rounded-xl flex items-start gap-2.5 text-sm font-medium ${
                statusMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'
              }`}>
                {statusMessage.type === 'success' ? <CheckCircle2 size={18} className="shrink-0 mt-0.5" /> : <AlertCircle size={18} className="shrink-0 mt-0.5" />}
                <span>{statusMessage.text}</span>
              </div>
            )}

            <button
              onClick={handleUpload}
              disabled={!file || isUploading}
              className="relative w-full mt-6 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2 overflow-hidden"
            >
              {isUploading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Memproses Vektor...
                  {/* Animasi progress bar palsu di latar belakang tombol */}
                  <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                </>
              ) : (
                <>
                  <Settings size={18} />
                  Latih AI Sekarang
                </>
              )}
            </button>
          </div>
        </div>

        {/* Kolom Kanan: Tabel Dokumen (Lebih lebar di layar besar) */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col h-full min-h-[500px]">
          
          {/* Header Tabel */}
          <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white rounded-t-2xl">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Database Dokumen</h2>
              <p className="text-sm text-gray-500">File yang saat ini menjadi sumber pengetahuan AI.</p>
            </div>
            <button 
              onClick={fetchDocuments}
              disabled={isLoadingDocs}
              className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50"
              title="Refresh Data"
            >
              <RefreshCw size={18} className={isLoadingDocs ? 'animate-spin' : ''} />
            </button>
          </div>
          
          {/* Konten Tabel */}
          <div className="flex-1 overflow-x-auto">
            {isLoadingDocs ? (
              <div className="flex flex-col justify-center items-center h-64 gap-3 text-gray-400">
                <Loader2 size={32} className="animate-spin text-indigo-500" />
                <p className="text-sm">Memuat data dokumen...</p>
              </div>
            ) : documents.length === 0 ? (
              <div className="flex flex-col justify-center items-center h-64 text-center px-6">
                <div className="bg-gray-50 p-4 rounded-full mb-4">
                  <Database size={32} className="text-gray-300" />
                </div>
                <h3 className="text-gray-900 font-medium mb-1">Database Kosong</h3>
                <p className="text-gray-500 text-sm max-w-sm">Belum ada dokumen yang diunggah. Unggah file PDF di sebelah kiri untuk melatih AI.</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-gray-50/80 text-gray-500 font-medium text-xs uppercase tracking-wider sticky top-0">
                  <tr>
                    <th scope="col" className="px-6 py-4">Nama Dokumen</th>
                    <th scope="col" className="px-6 py-4">Tanggal Diunggah</th>
                    <th scope="col" className="px-6 py-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {documents.map((doc) => (
                    <tr key={doc.id} className="hover:bg-gray-50/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="bg-red-50 text-red-500 p-2 rounded-lg">
                            <FileText size={16} />
                          </div>
                          <span className="font-medium text-gray-700">{doc.filename}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-500">
                        {new Date(doc.createdAt).toLocaleDateString('id-ID', { 
                          day: 'numeric', month: 'short', year: 'numeric', 
                          hour: '2-digit', minute: '2-digit' 
                        })}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => handleDelete(doc.id, doc.filename)}
                          className="inline-flex items-center gap-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors font-medium opacity-0 group-hover:opacity-100 focus:opacity-100"
                        >
                          <Trash2 size={16} />
                          Hapus
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          
          {/* Footer Tabel */}
          {!isLoadingDocs && documents.length > 0 && (
            <div className="p-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl text-xs text-gray-500 text-center">
              Menampilkan {documents.length} dokumen. Dokumen yang dihapus tidak dapat dipulihkan.
            </div>
          )}
        </div>

      </main>
    </div>
  );
}