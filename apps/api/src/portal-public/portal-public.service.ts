import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PortalPublicEntity } from './entities/portal-public.entity';

@Injectable()
export class PortalPublicService {
  constructor(private readonly prisma: PrismaService) {}

  async findBySlug(slug: string): Promise<PortalPublicEntity> {
    const portal = await this.prisma.clientPortal.findUnique({
      where: { slug },
      select: {
        slug: true,
        active: true,
        client: { select: { name: true, company: true } },
      },
    });
    if (!portal) throw new NotFoundException('Client portal not found');
    return {
      slug: portal.slug,
      active: portal.active,
      clientName: portal.client.name,
      company: portal.client.company,
    };
  }
}
