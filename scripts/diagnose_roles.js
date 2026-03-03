/**
 * DIAGNÓSTICO: Valores reais da coluna 'role' e 'status' na tabela User (produção).
 * Execução: node scripts/diagnose_roles.js
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const users = await prisma.user.findMany({
        select: { matricula: true, name: true, role: true, status: true }
    });

    console.log('\n===== VALORES EXATOS DE ROLE/STATUS (User) =====');
    console.log(`Total de usuários: ${users.length}\n`);

    // Contagem por role (case-sensitive — revela divergências)
    const roleCounts = {};
    users.forEach(u => {
        const key = `"${u.role}" | status: ${u.status ?? 'NULL'}`;
        roleCounts[key] = (roleCounts[key] || 0) + 1;
    });

    Object.entries(roleCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([role, count]) => console.log(`  ${count}x  ${role}`));

    // Filtro simulado: quem apareceria como Líder com a lógica NOVA (case-insensitive + sem acento)
    const normalize = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const liderKeywords = ['lider', 'supervisor', 'coordenador', 'tecnico de processo'];
    const lideres = users.filter(u =>
        u.status !== 'INATIVO' &&
        liderKeywords.some(kw => normalize(u.role).includes(kw))
    );

    const pqcs = users.filter(u =>
        u.status !== 'INATIVO' &&
        normalize(u.role).includes('pqc')
    );

    console.log(`\n===== LÍDERES (nova query) — ${lideres.length} encontrados =====`);
    lideres.forEach(u => console.log(`  [${u.matricula}] ${u.name} — role: "${u.role}"`));

    console.log(`\n===== PQCs (nova query) — ${pqcs.length} encontrados =====`);
    pqcs.forEach(u => console.log(`  [${u.matricula}] ${u.name} — role: "${u.role}"`));

    await prisma.$disconnect();
}

main().catch(e => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
});
