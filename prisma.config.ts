import { defineConfig } from '@prisma/config';
import 'dotenv/config';

export default defineConfig({
  // Gunakan DIRECT_URL agar Prisma memakai port 5432 untuk push skema
  datasource: {
    url: process.env.DIRECT_URL, 
  },
});