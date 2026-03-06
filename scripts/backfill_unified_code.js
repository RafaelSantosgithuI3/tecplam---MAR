// Backfill unifiedCode para todos os modelos existentes
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const models = await prisma.configModel.findMany();
    console.log(`Atualizando ${models.length} modelos...`);
    for (const m of models) {
        const unifiedCode = (m.name || '').substring(0, 7);
        await prisma.configModel.update({
            where: { name: m.name },
            data: { unifiedCode }
        });
    }
    console.log('✅ Backfill concluído!');
    await prisma.$disconnect();
}

main().catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
