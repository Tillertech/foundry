import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MilestoneEvents, type MilestoneInvoicedEvent } from '../common/events';
import { InvoiceStatus, MilestoneStatus } from '../generated/prisma/enums';
import { InvoicesService } from '../invoices/invoices.service';
import { PrismaService } from '../prisma/prisma.service';
import { MilestoneInvoiceSummaryEntity } from './entities/milestone.entity';

const round2 = (n: number) => Math.round(n * 100) / 100;
const DAY_MS = 864e5;

/**
 * Turns a priced milestone into a draft invoice. The milestone is the
 * billing unit: one invoice each (enforced by the unique Invoice.milestoneId),
 * with the project's retention percent held back on every invoice except
 * the retention-releasing (final) milestone, which bills its own amount
 * plus everything held so far.
 */
@Injectable()
export class MilestoneBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
    private readonly events: EventEmitter2,
  ) {}

  async invoice(
    ownerId: string,
    milestoneId: string,
  ): Promise<MilestoneInvoiceSummaryEntity> {
    const m = await this.prisma.milestone.findFirst({
      where: {
        id: milestoneId,
        project: { client: { workspace: { ownerId } } },
      },
      include: {
        invoice: { select: { number: true } },
        project: {
          include: {
            client: { include: { workspace: true } },
            quote: { select: { taxRate: true } },
          },
        },
      },
    });
    if (!m) throw new NotFoundException('Milestone not found');
    if (m.invoice) {
      throw new ConflictException(
        `This milestone is already invoiced on ${m.invoice.number}`,
      );
    }
    if (m.status === MilestoneStatus.cancelled) {
      throw new BadRequestException('A cancelled milestone cannot be invoiced');
    }
    const amount = Number(m.amount ?? 0);
    if (amount <= 0) {
      throw new BadRequestException(
        'Give the milestone a price before invoicing it',
      );
    }

    const { project } = m;
    const { client } = project;
    const { workspace } = client;
    const pct = Number(project.retentionPercent) || 0;
    const fmt = (n: number) => `${client.currency} ${n.toFixed(2)}`;

    const items: { description: string; quantity: number; rate: number }[] =
      [];
    const notes: string[] = [`Milestone: ${m.name}.`];
    let retained = 0;

    if (m.releasesRetention) {
      items.push({ description: m.name, quantity: 1, rate: amount });
      const held = await this.prisma.milestone.aggregate({
        _sum: { retainedAmount: true },
        where: {
          projectId: project.id,
          id: { not: m.id },
          invoice: { is: { status: { not: InvoiceStatus.cancelled } } },
        },
      });
      const release = round2(Number(held._sum.retainedAmount ?? 0));
      if (release > 0) {
        items.push({
          description: 'Retention release (held on earlier milestones)',
          quantity: 1,
          rate: release,
        });
        notes.push(`Includes ${fmt(release)} of retention released.`);
      }
    } else {
      retained = round2((amount * pct) / 100);
      items.push({
        description: retained ? `${m.name} (less ${pct}% retention)` : m.name,
        quantity: 1,
        rate: round2(amount - retained),
      });
      if (retained) {
        notes.push(
          `Milestone value ${fmt(amount)}; ${pct}% retention (${fmt(retained)}) is held until the final milestone.`,
        );
      }
    }
    if (m.acceptedAt) {
      notes.push(
        `Accepted${m.acceptedBy ? ` by ${m.acceptedBy}` : ''} on ${m.acceptedAt.toISOString().slice(0, 10)}.`,
      );
    }

    const now = new Date();
    const invoice = await this.invoices.create(
      ownerId,
      {
        clientId: client.id,
        projectId: project.id,
        issueDate: now.toISOString(),
        dueDate: new Date(
          now.getTime() + workspace.paymentTerms * DAY_MS,
        ).toISOString(),
        currency: client.currency,
        taxRate: Number(project.quote?.taxRate ?? workspace.taxRate),
        notes: notes.join(' '),
        items,
      },
      { milestoneId: m.id },
    );
    await this.prisma.milestone.update({
      where: { id: m.id },
      data: { retainedAmount: retained },
    });
    this.events.emit(MilestoneEvents.INVOICED, {
      ownerId,
      milestoneId: m.id,
      milestoneName: m.name,
      projectId: project.id,
      projectName: project.name,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
    } satisfies MilestoneInvoicedEvent);
    return { id: invoice.id, number: invoice.number, status: invoice.status };
  }
}
