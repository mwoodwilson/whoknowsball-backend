import nodemailer from 'nodemailer';

/**
 * Email Service
 *
 * Handles sending emails for 2FA codes and other notifications.
 * Uses nodemailer with configurable transport.
 */

interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;

  /**
   * Initialize the email transporter
   * Uses environment variables for SMTP configuration
   */
  private getTransporter(): nodemailer.Transporter {
    if (this.transporter) {
      return this.transporter;
    }

    // Check if email is configured
    const emailHost = process.env.EMAIL_HOST;
    const emailPort = process.env.EMAIL_PORT;
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;
    const emailFrom = process.env.EMAIL_FROM || 'noreply@whoknowsball.com';

    if (!emailHost || !emailPort || !emailUser || !emailPass) {
      console.warn('[EmailService] Email not configured. Set EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS in .env');

      // For development, use ethereal test account
      // In production, this should throw an error or use a real SMTP service
      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: 'ethereal.user@ethereal.email',
          pass: 'ethereal.password'
        }
      });

      console.warn('[EmailService] Using test email account. Emails will not be delivered.');
      return this.transporter;
    }

    // Production SMTP configuration
    this.transporter = nodemailer.createTransport({
      host: emailHost,
      port: parseInt(emailPort),
      secure: parseInt(emailPort) === 465, // true for 465, false for other ports
      auth: {
        user: emailUser,
        pass: emailPass
      }
    });

    return this.transporter;
  }

  /**
   * Send an email
   *
   * @param options - Email options (to, subject, text, html)
   * @returns Promise that resolves when email is sent
   */
  async sendEmail(options: EmailOptions): Promise<void> {
    try {
      const transporter = this.getTransporter();
      const emailFrom = process.env.EMAIL_FROM || 'WhoKnowsBall <noreply@whoknowsball.com>';

      const info = await transporter.sendMail({
        from: emailFrom,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html || options.text
      });

      console.log('[EmailService] Email sent:', info.messageId);

      // For test accounts, log preview URL
      if (process.env.NODE_ENV !== 'production') {
        const previewUrl = nodemailer.getTestMessageUrl(info);
        if (previewUrl) {
          console.log('[EmailService] Preview URL:', previewUrl);
        }
      }
    } catch (error) {
      console.error('[EmailService] Error sending email:', error);
      throw new Error('Failed to send email');
    }
  }

  /**
   * Send a 2FA verification code email
   *
   * @param to - Recipient email address
   * @param code - 6-digit verification code
   */
  async send2FACode(to: string, code: string): Promise<void> {
    const subject = 'Your WhoKnowsBall Verification Code';
    const text = `Your verification code is: ${code}\n\nThis code will expire in 5 minutes.\n\nIf you didn't request this code, please ignore this email.`;
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verification Code</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
          <tr>
            <td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <tr>
                  <td style="padding: 40px 40px 20px 40px; text-align: center;">
                    <h1 style="margin: 0; color: #1f2937; font-size: 28px; font-weight: 700;">WhoKnowsBall</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px 40px; text-align: center;">
                    <h2 style="margin: 0 0 16px 0; color: #374151; font-size: 24px; font-weight: 600;">Verification Code</h2>
                    <p style="margin: 0 0 24px 0; color: #6b7280; font-size: 16px; line-height: 1.5;">
                      Use this code to complete your two-factor authentication setup:
                    </p>
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; padding: 24px; margin: 24px 0;">
                      <div style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #ffffff; font-family: 'Courier New', monospace;">
                        ${code}
                      </div>
                    </div>
                    <p style="margin: 24px 0 0 0; color: #9ca3af; font-size: 14px;">
                      This code will expire in <strong>5 minutes</strong>.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px 40px 40px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0; color: #9ca3af; font-size: 14px; line-height: 1.5;">
                      If you didn't request this code, please ignore this email.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    await this.sendEmail({ to, subject, text, html });
  }
}

// Export singleton instance
export const emailService = new EmailService();
