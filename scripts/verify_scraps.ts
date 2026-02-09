
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Verificando registros na tabela ScrapLog...');
    const logs = await prisma.scrapLog.findMany({
        take: 3,
    });

    console.log('Total inserido:', await prisma.scrapLog.count());
    console.log('Registros encontrados (IDs devem ser inteiros):');
    console.log(JSON.stringify(logs, null, 2));
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
