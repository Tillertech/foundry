import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InvoiceEvents } from '../common/events';
import { InvoiceStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Daily invoice housekeeping:
 * flip past-due invoices to overdue and emails
 * due-date reminders for workspaces that opted in. Workspace controls
 * the schedule - remindersEnabled turns the mails on, reminderDaysBefore
 * sets how many days ahead of the due date reminders start and how often
 * they repeat (lastRemindedAt throttles re-sends).
 */
@Injectable()
export class InvoiceTaskService {
  private readonly logger = new Logger(InvoiceTaskService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async handleInvoiceReminders(): Promise<void> {
    await this.markOverdue();
    await this.sendDueReminders();
  }

  /** Sent/viewed invoices past their due date become overdue. */
  private async markOverdue(): Promise<void> {
    const { count } = await this.prisma.invoice.updateMany({
      where: {
        status: { in: [InvoiceStatus.sent, InvoiceStatus.viewed] },
        dueDate: { lt: new Date() },
      },
      data: { status: InvoiceStatus.overdue },
    });
    if (count) this.logger.log(`Marked ${count} invoice(s) overdue`);
  }

  /**
   * Emits invoice.reminder_due for every open invoice inside its workspace's
   * reminder window; the notification pipeline mails the client.
   */
  private async sendDueReminders(): Promise<void> {
    const now = new Date();
    const candidates = await this.prisma.invoice.findMany({
      where: {
        status: {
          in: [
            InvoiceStatus.sent,
            InvoiceStatus.viewed,
            InvoiceStatus.partially_paid,
            InvoiceStatus.overdue,
          ],
        },
        client: { workspace: { remindersEnabled: true } },
      },
      include: {
        items: true,
        client: {
          include: {
            workspace: { select: { reminderDaysBefore: true } },
          },
        },
      },
    });

    let sent = 0;
    for (const candidate of candidates) {
      const { client: clientWithWorkspace, ...invoice } = candidate;
      const { workspace, ...client } = clientWithWorkspace;

      const days = Math.max(1, workspace.reminderDaysBefore);
      const windowStart = invoice.dueDate.getTime() - days * DAY_MS;
      if (now.getTime() < windowStart) continue;
      if (
        invoice.lastRemindedAt &&
        now.getTime() - invoice.lastRemindedAt.getTime() < days * DAY_MS
      ) {
        continue;
      }

      this.events.emit(InvoiceEvents.REMINDER_DUE, { invoice, client });
      await this.prisma.invoice.update({
        where: { id: candidate.id },
        data: { lastRemindedAt: now },
      });
      sent += 1;
    }
    if (sent) this.logger.log(`Queued ${sent} invoice reminder(s)`);
  }
}
