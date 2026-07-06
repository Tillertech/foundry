import { MailerService } from '@nestjs-modules/mailer';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

export interface MailJobData {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export const MAIL_QUEUE = 'mail';

@Processor(MAIL_QUEUE)
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(private readonly mailer: MailerService) {
    super();
  }

  async process(job: Job<MailJobData>): Promise<void> {
    this.logger.debug(`Sending "${job.data.subject}" to ${job.data.to}`);
    await this.mailer.sendMail({
      to: job.data.to,
      subject: job.data.subject,
      text: job.data.text,
      html: job.data.html,
    });
  }
}
