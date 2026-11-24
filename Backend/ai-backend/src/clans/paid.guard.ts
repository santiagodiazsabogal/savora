import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isPaid } from '../common/plans';

// Gate de plan: los Clanes son para PRO y CHEF. Corre DESPUÉS de JwtAuthGuard
// (req.user.id ya seteado). El JWT no trae el plan, así que se consulta a la DB.
@Injectable()
export class PaidGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException('PRO_ONLY');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });
    if (!isPaid(user?.plan)) throw new ForbiddenException('PRO_ONLY');
    return true;
  }
}
