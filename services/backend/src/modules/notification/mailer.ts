/**
 * Mailer port (integrations.md). Callers depend on this seam; SMTP is one
 * adapter behind it. The stub keeps every flow working offline.
 */

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export const MAILER = Symbol('MAILER');
