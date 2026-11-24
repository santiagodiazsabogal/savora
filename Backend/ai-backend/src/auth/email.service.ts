import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private resend = new Resend(process.env.RESEND_API_KEY);

  async sendVerificationEmail(email: string, token: string) {

    const baseUrl = process.env.APP_URL ?? 'http://localhost:3000';
    const verificationUrl = `${baseUrl}/api/auth/verify?token=${token}`;

    if (process.env.EMAIL_ENABLED !== 'true') {
      console.log('EMAIL DESACTIVADO — link:', verificationUrl);
      return;
    }

    await this.resend.emails.send({
      from: process.env.EMAIL_FROM ?? 'onboarding@resend.dev',
      to: email,
      subject: 'Verify your email',
      html: `
        <h2>Verify your account</h2>
        <p>Click below to verify your email:</p>
        <a href="${verificationUrl}">${verificationUrl}</a>
        <p>This link expires in 24 hours.</p>
      `,
    });
  }

  // 📋 Waitlist Email 1: confirmación + posición + link de referido. Mismo patrón
  // dev-mode que el resto: sin EMAIL_ENABLED=true solo loguea a consola.
  async sendWaitlistWelcomeEmail(email: string, referralCode: string, position: number) {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    const referralUrl = `${frontendUrl}/waitlist?ref=${referralCode}`;

    if (process.env.EMAIL_ENABLED !== 'true') {
      console.log(`EMAIL DESACTIVADO — waitlist #${position}, referral link: ${referralUrl}`);
      return;
    }

    await this.resend.emails.send({
      from: process.env.EMAIL_FROM ?? 'onboarding@resend.dev',
      to: email,
      subject: `You're #${position} on the Savora waitlist 🎉`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
          <h2 style="color:#E8520A">You're on the list! 🧑‍🍳</h2>
          <p>Welcome to <strong>Savora</strong> — your AI cooking companion. Tu sabor, sin límites.</p>
          <p style="font-size:20px">Your spot: <strong>#${position}</strong></p>
          <p>Want early access sooner? Share your personal link — every friend who joins moves you up the line:</p>
          <p><a href="${referralUrl}" style="color:#E8520A;font-weight:bold">${referralUrl}</a></p>
          <ul>
            <li><strong>Top 100</strong> → 6 months of Pro, free</li>
            <li><strong>Top 500</strong> → 3 months of Pro, free</li>
            <li>Everyone else → 30 days of Pro at launch</li>
          </ul>
          <p style="color:#888;font-size:12px">You're receiving this because you joined the Savora waitlist.</p>
        </div>
      `,
    });
  }

  // Email de recuperación de contraseña → enlaza a la página del FRONTEND.
  async sendPasswordResetEmail(email: string, token: string) {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

    if (process.env.EMAIL_ENABLED !== 'true') {
      console.log('EMAIL DESACTIVADO — reset link:', resetUrl);
      return;
    }

    await this.resend.emails.send({
      from: process.env.EMAIL_FROM ?? 'onboarding@resend.dev',
      to: email,
      subject: 'Reset your password',
      html: `
        <h2>Reset your password</h2>
        <p>We received a request to reset your password. Click below to choose a new one:</p>
        <a href="${resetUrl}">${resetUrl}</a>
        <p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
      `,
    });
  }
}