import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly mailerService: MailerService) {}

  async sendPasswordResetOtp(to: string, name: string, otp: string) {
    await this.send(
      to,
      'Your Foundry password reset code',
      'password-reset-otp',
      {
        name,
        otp,
        email: to,
      },
    );
  }

  private async send(
    to: string,
    subject: string,
    template: string,
    context: Record<string, unknown>,
  ) {
    try {
      await this.mailerService.sendMail({
        to,
        subject,
        template,
        context,
      });
      this.logger.log(`Email sent  ${to} | ${subject}`);
    } catch (err) {
      this.logger.error(
        `Email failed  ${to} | ${subject} | ${(err as Error).message}`,
      );
    }
  }
}
