import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString:
          config.get<string>('DATABASE_URL') ??
          'postgresql://postgres:postgres@localhost:5433/foundry',
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
    } catch (err) {
      this.logger.warn(
        `Database not reachable yet — continuing without an eager connection (${(err as Error).message})`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
