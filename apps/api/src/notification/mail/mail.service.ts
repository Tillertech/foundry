import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';

export interface InvoiceMailLineItem {
  description: string;
  quantity: string;
  rate: string;
  amount: string;
}

export interface InvoiceMailExpenseLine {
  description: string;
  /** Date the expense was incurred; '' if the expense was since deleted. */
  date: string;
  amount: string;
}

export interface InvoiceMailContext {
  clientName: string;
  workspaceName: string;
  number: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  /** Regular (non-expense) lines. */
  items: InvoiceMailLineItem[];
  hasItems: boolean;
  /** Lines re-billing the workspace's billable expenses, shown as their own section. */
  expenses: InvoiceMailExpenseLine[];
  hasExpenses: boolean;
  /** Sum of the regular lines. */
  itemsTotal: string;
  /** Sum of the re-billed expense lines. */
  expensesTotal: string;
  subtotal: string;
  discount: string;
  taxRate: string;
  tax: string;
  total: string;
  notes: string;
  /** Total actually received against the invoice to date. */
  amountPaid: string;
  /** Amount received beyond the total; empty string when not overpaid. */
  overpaidBy: string;
  /** Amount still owed (0 once settled or overpaid). */
  balanceDue: string;
  /** Percent of the invoice total paid so far, 0-100. */
  percentPaid: string;
  /** Whether a PDF payment receipt is attached to this mail. */
  hasReceipt: boolean;
}

export interface InvoicePartiallyPaidMailContext extends InvoiceMailContext {
  /** Amount received in this specific payment, in the invoice currency. */
  paymentAmount: string;
}

export interface QuoteMailContext {
  clientName: string;
  workspaceName: string;
  number: string;
  issueDate: string;
  validUntil: string;
  currency: string;
  items: InvoiceMailLineItem[];
  subtotal: string;
  taxRate: string;
  tax: string;
  total: string;
  notes: string;
}

export interface DocumentMailContext {
  clientName: string;
  workspaceName: string;
  documentName: string;
  documentType: string;
  notes: string;
}

/**
 * Milestone progress block shared by project mails. Every key is always
 * present (handlebars runs strict); `hasProgress` is false when the project
 * has no milestones, and the template skips the block.
 */
export interface ProjectProgressMailContext {
  hasProgress: boolean;
  /** Percent complete, 0-100, excluding cancelled milestones. */
  progress: number;
  /** 100 - progress, for the unfilled part of the bar. */
  remaining: number;
  completedMilestones: number;
  totalMilestones: number;
  /** Next milestone not yet completed, by the project's manual order; '' when none. */
  nextMilestoneName: string;
  /** Deep link to the project in the client portal; '' when no portal URL is configured. */
  projectUrl: string;
}

export interface ProjectStatusMailContext extends ProjectProgressMailContext {
  clientName: string;
  workspaceName: string;
  projectName: string;
  previousStatus: string;
  status: string;
}

export interface MilestoneCompletedMailContext
  extends ProjectProgressMailContext {
  clientName: string;
  workspaceName: string;
  projectName: string;
  milestoneName: string;
  milestoneDescription: string;
  completedDate: string;
}

/** Display name on platform mail*/
const PLATFORM_SENDER_NAME = 'Foundry';

interface Sender {
  name: string;
  address: string;
}

interface Attachment {
  filename: string;
  content: Buffer;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly mailerService: MailerService,
    private readonly config: ConfigService,
  ) {}

  async sendEmailVerificationOtp(to: string, name: string, otp: string) {
    // Deep link back to the verification screen with the address prefilled, so
    // a mobile user who left to read the code can tap straight back into the
    // right page. The code itself is never in the URL.
    const appUrl = this.config.get<string>('APP_URL')?.replace(/\/+$/, '');
    const verifyUrl = appUrl
      ? `${appUrl}/auth/verify?email=${encodeURIComponent(to)}`
      : '';

    await this.send(
      to,
      'Confirm your email for Foundry',
      'email-verification-otp',
      {
        name,
        otp,
        email: to,
        verifyUrl,
      },
    );
  }

  async sendLoginOtp(to: string, name: string, otp: string) {
    // Deep link back to the sign-in code screen with the address prefilled, so
    // a mobile user who left to read the code can tap straight back in.
    const appUrl = this.config.get<string>('APP_URL')?.replace(/\/+$/, '');
    const verifyUrl = appUrl
      ? `${appUrl}/auth/verify-login?email=${encodeURIComponent(to)}`
      : '';

    await this.send(to, 'Your Foundry sign-in code', 'login-otp', {
      name,
      otp,
      email: to,
      verifyUrl,
    });
  }

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

  sendInvoice(
    to: string,
    context: InvoiceMailContext,
    pdf?: Buffer,
  ): Promise<boolean> {
    return this.send(
      to,
      `Invoice ${context.number} from ${context.workspaceName}`,
      'invoice-sent',
      { ...context },
      this.workspaceSender(context.workspaceName),
      pdf ? [{ filename: `${context.number}.pdf`, content: pdf }] : undefined,
    );
  }

  sendInvoicePaid(
    to: string,
    context: InvoiceMailContext,
    receipt?: Buffer,
  ): Promise<boolean> {
    return this.send(
      to,
      `Payment received for invoice ${context.number}`,
      'invoice-paid',
      { ...context },
      this.workspaceSender(context.workspaceName),
      receipt
        ? [{ filename: `Receipt-${context.number}.pdf`, content: receipt }]
        : undefined,
    );
  }

  sendInvoicePartiallyPaid(
    to: string,
    context: InvoicePartiallyPaidMailContext,
    receipt?: Buffer,
  ): Promise<boolean> {
    return this.send(
      to,
      `Payment received for invoice ${context.number} - ${context.currency} ${context.balanceDue} remaining`,
      'invoice-partially-paid',
      { ...context },
      this.workspaceSender(context.workspaceName),
      receipt
        ? [{ filename: `Receipt-${context.number}.pdf`, content: receipt }]
        : undefined,
    );
  }

  sendInvoiceReminder(
    to: string,
    context: InvoiceMailContext,
  ): Promise<boolean> {
    return this.send(
      to,
      `Reminder: invoice ${context.number} is due`,
      'invoice-reminder',
      { ...context },
      this.workspaceSender(context.workspaceName),
    );
  }

  sendQuote(
    to: string,
    context: QuoteMailContext,
    pdf?: Buffer,
  ): Promise<boolean> {
    return this.send(
      to,
      `Quote ${context.number} from ${context.workspaceName}`,
      'quote-sent',
      { ...context },
      this.workspaceSender(context.workspaceName),
      pdf ? [{ filename: `${context.number}.pdf`, content: pdf }] : undefined,
    );
  }

  sendDocument(
    to: string,
    context: DocumentMailContext,
    attachment: Attachment,
  ): Promise<boolean> {
    return this.send(
      to,
      `${context.documentName} from ${context.workspaceName}`,
      'document-shared',
      { ...context },
      this.workspaceSender(context.workspaceName),
      [attachment],
    );
  }

  sendProjectStatusChanged(
    to: string,
    context: ProjectStatusMailContext,
  ): Promise<boolean> {
    return this.send(
      to,
      `${context.projectName} is now ${context.status}`,
      'project-status-changed',
      { ...context },
      this.workspaceSender(context.workspaceName),
    );
  }

  sendMilestoneCompleted(
    to: string,
    context: MilestoneCompletedMailContext,
  ): Promise<boolean> {
    return this.send(
      to,
      `Milestone completed: ${context.milestoneName} (${context.projectName})`,
      'milestone-completed',
      { ...context },
      this.workspaceSender(context.workspaceName),
    );
  }

  /** `${PORTAL_APP_URL}/:slug/projects/:id`, or '' when no portal URL is configured. */
  portalProjectUrl(portalSlug: string, projectId: string): string {
    const base = this.portalAppUrl();
    return base ? `${base}/${portalSlug}/projects/${projectId}` : '';
  }

  sendUserInvite(
    to: string,
    name: string,
    workspaceName: string,
    portalSlug: string,
    token: string,
  ): Promise<boolean> {
    // client-portal is one shared deployment for every tenant - the slug in
    // the path is what tells it (and the person clicking the link) which
    // client's portal this is, until it gets its own per-tenant domain.
    const acceptUrl = this.portalUrl(portalSlug, '/accept-invite', token, to);

    return this.send(
      to,
      `You've been invited to ${workspaceName}'s client portal`,
      'portal-user-invite',
      {
        name,
        workspaceName,
        portalSlug,
        acceptUrl,
      },
      this.workspaceSender(workspaceName),
    );
  }

  sendPasswordReset(
    to: string,
    name: string,
    portalSlug: string,
    token: string,
  ): Promise<boolean> {
    const resetUrl = this.portalUrl(portalSlug, '/reset-password', token, to);

    return this.send(
      to,
      'Reset your client portal password',
      'portal-password-reset',
      {
        name,
        resetUrl,
      },
    );
  }

  /** Builds a `${PORTAL_APP_URL}/:slug${path}?token=...&email=...` deep link for the client-portal SPA. */
  private portalUrl(
    portalSlug: string,
    path: string,
    token: string,
    email: string,
  ): string {
    const portalAppUrl = this.portalAppUrl();
    if (!portalAppUrl) return '';
    return `${portalAppUrl}/${portalSlug}${path}?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
  }

  private portalAppUrl(): string {
    const explicitPortalUrl = this.config
      .get<string>('PORTAL_APP_URL')
      ?.replace(/\/+$/, '');
    const appUrl = this.config.get<string>('APP_URL')?.replace(/\/+$/, '');
    return explicitPortalUrl ?? (appUrl ? `${appUrl}/portal` : '');
  }

  /**
   * `"Acme Studio" <acme-studio@notification.tillertech.io>` - the workspace
   * name as both display name and local part, on the SEND_EMAIL_FROM domain,
   * so the recipient sees who the mail is really from rather than the
   * platform. Any local part on the verified sending domain is accepted by
   * the provider, so nothing needs provisioning per workspace.
   */
  private workspaceSender(workspaceName: string): Sender {
    const { address } = this.platformSender();
    const [defaultLocal, domain] = address.split('@');
    const local =
      workspaceName
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 64)
        .replace(/^-+|-+$/g, '') || defaultLocal;

    return {
      name: workspaceName.trim() || PLATFORM_SENDER_NAME,
      address: `${local}@${domain}`,
    };
  }

  private platformSender(): Sender {
    return {
      name: PLATFORM_SENDER_NAME,
      address: this.config.get<string>(
        'SEND_EMAIL_FROM',
        'notification@notification.tillertech.io',
      ),
    };
  }

  /** Resolves true when the transport accepted the mail, false otherwise. */
  private async send(
    to: string,
    subject: string,
    template: string,
    context: Record<string, unknown>,
    from: Sender = this.platformSender(),
    attachments?: Attachment[],
  ): Promise<boolean> {
    try {
      await this.mailerService.sendMail({
        from,
        to,
        subject,
        template,
        context,
        attachments,
      });
      this.logger.log(`Email sent  ${to} | ${subject}`);
      return true;
    } catch (err) {
      this.logger.error(
        `Email failed  ${to} | ${subject} | ${(err as Error).message}`,
      );
      return false;
    }
  }
}
