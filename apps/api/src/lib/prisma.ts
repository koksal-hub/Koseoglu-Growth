import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { requireDatabaseUrl } from '../plugins/env';

const adapter = new PrismaPg(requireDatabaseUrl(process.env));

export const prisma = new PrismaClient({ adapter });
