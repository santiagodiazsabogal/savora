import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Gate del panel de moderación: solo usuarios con isAdmin. Corre DESPUÉS de JwtAuthGuard
// (req.user.id ya está seteado). El JWT no trae isAdmin, así que se consulta a la DB.
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException('NOT_ADMIN');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });
    if (!user?.isAdmin) throw new ForbiddenException('NOT_ADMIN');
    return true;
  }
}
