import { defineConfig } from '@prisma/config';
import 'dotenv/config';

export default defineConfig({
  // Prisma meminta blok datasource ini secara eksplisit untuk db push
  datasource: {
    url: process.env.DATABASE_URL,
  },
  // Kita biarkan blok migrate untuk berjaga-jaga
  migrate: {
    connectionUrl: process.env.DATABASE_URL,
  },
});