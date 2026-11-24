import { WaitlistService } from './waitlist.service';

// Waitlist: registro + referidos + posición calculada + anti-spam de dominios.
// Mismo patrón que el resto: new Service(mockPrisma), sin DB ni DI de Nest.

function makePrisma() {
  return {
    waitlistEntry: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'uuid-1', referralCount: 0, createdAt: new Date('2026-07-13T10:00:00Z'), ...data })),
      update: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
}

function makeEmail() {
  return { sendWaitlistWelcomeEmail: jest.fn().mockResolvedValue(undefined) };
}

function build() {
  const prisma = makePrisma();
  const email = makeEmail();
  const service = new WaitlistService(prisma as any, email as any);
  return { service, prisma, email };
}

describe('WaitlistService — registro', () => {
  it('registro nuevo → crea entry, posición última (0 referidos) y dispara Email 1', async () => {
    const { service, prisma, email } = build();
    // 5 ya registrados sin referidos "por delante" → posición 6; total 6.
    prisma.waitlistEntry.count
      .mockResolvedValueOnce(5) // positionOf: cuántos van delante
      .mockResolvedValueOnce(6); // totalSignups
    const res = await service.join('  NEW@Email.com ');
    expect(prisma.waitlistEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: 'new@email.com', referredBy: null }) }),
    );
    expect(res.position).toBe(6);
    expect(res.totalSignups).toBe(6);
    expect(res.referralCode).toHaveLength(8);
    expect(email.sendWaitlistWelcomeEmail).toHaveBeenCalledWith('new@email.com', res.referralCode, 6);
  });

  it('email desechable → 400 DISPOSABLE_EMAIL sin tocar la DB', async () => {
    const { service, prisma } = build();
    await expect(service.join('spam@mailinator.com')).rejects.toMatchObject({ status: 400 });
    expect(prisma.waitlistEntry.create).not.toHaveBeenCalled();
  });

  it('ya registrado → 409 ALREADY_REGISTERED con su posición y código actuales', async () => {
    const { service, prisma, email } = build();
    prisma.waitlistEntry.findUnique.mockResolvedValue({
      id: 'x', email: 'dup@a.com', referralCode: 'ABCD2345', referralCount: 2,
      createdAt: new Date('2026-07-01T00:00:00Z'),
    });
    prisma.waitlistEntry.count.mockResolvedValueOnce(0).mockResolvedValueOnce(10);
    await expect(service.join('dup@a.com')).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ message: 'ALREADY_REGISTERED', position: 1, referralCode: 'ABCD2345', totalSignups: 10 }),
    });
    expect(email.sendWaitlistWelcomeEmail).not.toHaveBeenCalled();
  });
});

describe('WaitlistService — referidos', () => {
  it('con ?ref válido → guarda referredBy e incrementa referralCount del referente', async () => {
    const { service, prisma } = build();
    const referrer = { id: 'ref-id', referralCode: 'FRIEND22', referralCount: 0, createdAt: new Date() };
    // 1ª findUnique = email (no existe); 2ª = código del referente.
    prisma.waitlistEntry.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(referrer);
    await service.join('nuevo@a.com', 'friend22'); // lowercase → se normaliza
    expect(prisma.waitlistEntry.findUnique).toHaveBeenCalledWith({ where: { referralCode: 'FRIEND22' } });
    expect(prisma.waitlistEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ referredBy: 'FRIEND22' }) }),
    );
    expect(prisma.waitlistEntry.update).toHaveBeenCalledWith({
      where: { id: 'ref-id' },
      data: { referralCount: { increment: 1 } },
    });
  });

  it('con ?ref inválido → registra igual, sin referredBy ni increment', async () => {
    const { service, prisma } = build();
    prisma.waitlistEntry.findUnique.mockResolvedValue(null); // ni email ni código existen
    const res = await service.join('nuevo@a.com', 'NOEXISTE');
    expect(res.referralCode).toHaveLength(8);
    expect(prisma.waitlistEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ referredBy: null }) }),
    );
    expect(prisma.waitlistEntry.update).not.toHaveBeenCalled();
  });
});

describe('WaitlistService — posición y estado', () => {
  it('la posición cuenta a los que tienen MÁS referidos o mismo count pero antes', async () => {
    const { service, prisma } = build();
    const entry = { referralCode: 'MYCODE22', referralCount: 3, createdAt: new Date('2026-07-10T00:00:00Z') };
    prisma.waitlistEntry.findUnique.mockResolvedValue(entry);
    prisma.waitlistEntry.count.mockResolvedValueOnce(4).mockResolvedValueOnce(100);
    const res = await service.status('mycode22');
    expect(prisma.waitlistEntry.count).toHaveBeenCalledWith({
      where: {
        OR: [
          { referralCount: { gt: 3 } },
          { referralCount: 3, createdAt: { lt: entry.createdAt } },
        ],
      },
    });
    expect(res).toEqual({ position: 5, referralCount: 3, totalSignups: 100 });
  });

  it('código inexistente → 404', async () => {
    const { service, prisma } = build();
    prisma.waitlistEntry.findUnique.mockResolvedValue(null);
    await expect(service.status('NADA1234')).rejects.toMatchObject({ status: 404 });
  });
});

describe('WaitlistService — fallo de email no rompe el registro', () => {
  it('Resend lanza → el registro responde igual con posición', async () => {
    const { service, email } = build();
    email.sendWaitlistWelcomeEmail.mockRejectedValue(new Error('resend down'));
    const res = await service.join('ok@a.com');
    expect(res.referralCode).toHaveLength(8);
  });
});
