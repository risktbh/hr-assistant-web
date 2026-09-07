import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HR AI Assistant",
  description: "Asisten AI untuk HR & Keuangan berbasis RAG",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-gray-50/50">
        {/* Konten Halaman Menguasai Seluruh Layar */}
        <main className="flex-1 flex flex-col">
          {children}
        </main>
      </body>
    </html>
  );
}