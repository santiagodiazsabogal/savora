import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

// Tests unitarios de login + refresh tokens (rotación). Seguridad-crítico:
// gate de cuentas no-verificadas/baneadas/borradas y la rotación de refresh (un solo uso).
describe('AuthService', () => {
  let prisma: any;
  let jwt: any;
  let service: AuthService;
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('correct-password', 10);
  });

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      refreshToken: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    jwt = { sign: jest.fn().mockReturnValue('signed.jwt.token') };
    service = new AuthService({} as any, {} as any, prisma, jwt);
  });

  afterEach(() => jest.clearAllMocks());

  const baseUser = (over: any = {}) => ({
    id: 7, email: 'a@b.com', password: passwordHash,
    isVerified: true, deletedAt: null, bannedAt: null, ...over,
  });

  describe('login', () => {
    it('credenciales válidas → access_token + refresh_token y crea la fila de refresh', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser());
      const r: any = await service.login('a@b.com', 'correct-password');
      expect(r.access_token).toBe('signed.jwt.token');
      expect(typeof r.refresh_token).toBe('string');
      expect(r.refresh_token.length).toBeGreaterThan(0);
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    });

    it('usuario inexistente → 401', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.login('x@y.com', 'z')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('cuenta borrada (deletedAt) → 401', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser({ deletedAt: new Date() }));
      await expect(service.login('a@b.com', 'correct-password')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('password incorrecto → 401 y NO emite tokens', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser());
      await expect(service.login('a@b.com', 'wrong-password')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('email no verificado → 401', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser({ isVerified: false }));
      await expect(service.login('a@b.com', 'correct-password')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('cuenta baneada → 401 ACCOUNT_SUSPENDED (tras validar la contraseña)', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser({ bannedAt: new Date() }));
      await expect(service.login('a@b.com', 'correct-password')).rejects.toThrow('ACCOUNT_SUSPENDED');
    });
  });

  describe('register (aceptación de términos server-side)', () => {
    let usersService: any;
    let emailService: any;
    let svc: AuthService;

    beforeEach(() => {
      usersService = {
        createUser: jest.fn().mockResolvedValue({ email: 'a@b.com', verificationToken: 'tok' }),
      };
      emailService = { sendVerificationEmail: jest.fn().mockResolvedValue(undefined) };
      svc = new AuthService(usersService, emailService, prisma, jwt);
    });

    it('sin acceptTerms → 400 TERMS_NOT_ACCEPTED y NO crea la cuenta', async () => {
      await expect(
        svc.register({ email: 'a@b.com', password: '123456' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        svc.register({ email: 'a@b.com', password: '123456', acceptTerms: false } as any),
      ).rejects.toThrow('TERMS_NOT_ACCEPTED');
      expect(usersService.createUser).not.toHaveBeenCalled();
      expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('con acceptTerms=true → crea la cuenta y manda el email de verificación', async () => {
      const r: any = await svc.register({
        email: 'a@b.com', password: '123456', name: 'Ana', acceptTerms: true,
      } as any);
      expect(usersService.createUser).toHaveBeenCalledWith('a@b.com', '123456', 'Ana');
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith('a@b.com', 'tok');
      expect(r.message).toBeTruthy();
    });
  });

  describe('refresh (rotación, un solo uso)', () => {
    const validRecord = (over: any = {}) => ({
      id: 'rt1', revokedAt: null,
      expiresAt: new Date(Date.now() + 1_000_000),
      user: baseUser(), ...over,
    });

    it('token válido → revoca el usado y emite un par nuevo', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(validRecord());
      const r: any = await service.refresh('raw-token');
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({ where: { id: 'rt1' }, data: { revokedAt: expect.any(Date) } });
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1); // nuevo refresh emitido
      expect(r.access_token).toBe('signed.jwt.token');
    });

    it('token vacío → 401', async () => {
      await expect(service.refresh('')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('token inexistente → 401', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.refresh('x')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('reuso de token ya revocado → 401', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(validRecord({ revokedAt: new Date() }));
      await expect(service.refresh('x')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('token caducado → 401', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(validRecord({ expiresAt: new Date(Date.now() - 1000) }));
      await expect(service.refresh('x')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('cuenta baneada → 401 ACCOUNT_SUSPENDED, revoca el token y NO emite uno nuevo', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(validRecord({ user: baseUser({ bannedAt: new Date() }) }));
      await expect(service.refresh('x')).rejects.toThrow('ACCOUNT_SUSPENDED');
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({ where: { id: 'rt1' }, data: { revokedAt: expect.any(Date) } });
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revoca el refresh token', async () => {
      await service.logout('raw-token');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    });
    it('token vacío → no-op (no escribe)', async () => {
      await service.logout('');
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });
});
