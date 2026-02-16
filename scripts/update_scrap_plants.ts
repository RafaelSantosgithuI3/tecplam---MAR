import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Iniciando script de atualização de Plantas nos Scraps...");

    // Buscando scraps sem planta ou com planta não definida
    const scrapsToUpdate = await prisma.scrapLog.findMany({
        where: {
            OR: [
                { plant: null },
                { plant: '' }
            ]
        }
    });

    console.log(`Encontrados ${scrapsToUpdate.length} scraps pendentes de atualização.`);

    if (scrapsToUpdate.length === 0) {
        console.log("Nenhum scrap para atualizar.");
        return;
    }

    // Buscando todos os materiais para mapeamento
    const materials = await prisma.material.findMany();
    const materialMap = new Map<string, string>();

    materials.forEach(m => {
        if (m.code && m.plant) {
            materialMap.set(m.code, m.plant);
        }
    });

    console.log(`Carregados ${materialMap.size} materiais para referência.`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const scrap of scrapsToUpdate) {
        if (scrap.code && materialMap.has(scrap.code)) {
            const plant = materialMap.get(scrap.code);
            await prisma.scrapLog.update({
                where: { id: scrap.id },
                data: { plant: plant }
            });
            updatedCount++;
            if (updatedCount % 50 === 0) {
                console.log(`Progresso: ${updatedCount} scraps atualizados...`);
            }
        } else {
            skippedCount++;
        }
    }

    console.log("--------------------------------------------------");
    console.log("Atualização Concluída.");
    console.log(`Total Atualizado: ${updatedCount}`);
    console.log(`Total Ignorado (Código não encontrado ou sem planta): ${skippedCount}`);
    console.log("--------------------------------------------------");
}

main()
    .catch(e => {
        console.error("Erro ao executar script:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
