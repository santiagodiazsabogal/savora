// Backfill de @username para usuarios que aún no tienen uno (one-off).
// Genera un handle a partir del nombre o del email, garantizando unicidad.
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function slug(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // quita acentos
    .replace(/[^a-z0-9]/g, '')         // solo a-z0-9
    .slice(0, 15);
}

(async () => {
  const taken = new Set(
    (await prisma.user.findMany({ where: { username: { not: null } }, select: { username: true } }))
      .map((u) => u.username),
  );
  const users = await prisma.user.findMany({
    where: { username: null },
    select: { id: true, name: true, email: true },
    orderBy: { id: 'asc' },
  });

  let n = 0;
  for (const u of users) {
    let base = slug(u.name) || slug(u.email.split('@')[0]) || 'chef';
    if (base.length < 3) base = (base + 'chef').slice(0, 15);
    let candidate = base;
    let i = 1;
    while (taken.has(candidate)) candidate = `${base}${i++}`.slice(0, 20);
    taken.add(candidate);
    await prisma.user.update({ where: { id: u.id }, data: { username: candidate } });
    console.log(`#${u.id} → @${candidate}`);
    n++;
  }
  console.log(`backfill OK (${n} usuarios)`);
  await prisma.$disconnect();
})();
