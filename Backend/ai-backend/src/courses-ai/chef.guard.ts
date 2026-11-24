import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isChef } from '../common/plans';

// Gate de plan: los Cursos son exclusivos del tier CHEF. Corre DESPUÉS de JwtAuthGuard
// (req.user.id ya está seteado). El JWT no trae el plan, así que se consulta a la DB.
@Injectable()
export class ChefGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const userId = req.user?.id;
    if (!userId) throw new ForbiddenException('CHEF_ONLY');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });
    if (!isChef(user?.plan)) throw new ForbiddenException('CHEF_ONLY');
    return true;
  }
}
