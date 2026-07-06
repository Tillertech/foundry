import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Used by the Prisma CLI (migrate/studio). The runtime connection is
    // configured in apps/api/src/prisma/prisma.service.ts via @prisma/adapter-pg.
    url:
      process.env['DATABASE_URL'] ??
      'postgresql://postgres:postgres@localhost:5433/foundry',
  },
});
