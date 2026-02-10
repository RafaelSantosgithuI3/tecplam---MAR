
import sqlite3 from 'sqlite3';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';

// --- CONFIGURAÇÃO ---
const LEGACY_DB_PATH = path.resolve(__dirname, '..', 'legacy.db');
const prisma = new PrismaClient();

async function main() {
    console.log("🚀 Iniciando migração de legacy.db para Prisma...");

    // 1. Verificar existência do banco legado
    if (!fs.existsSync(LEGACY_DB_PATH)) {
        console.error("❌ Arquivo legacy.db não encontrado na raiz do projeto.");
        process.exit(1);
    }

    // 2. Conectar ao SQLite legado
    const legacyDb = new sqlite3.Database(LEGACY_DB_PATH, sqlite3.OPEN_READONLY, (err) => {
        if (err) {
            console.error("❌ Erro ao abrir legacy.db:", err.message);
            process.exit(1);
        }
        console.log("✅ Conectado ao legacy.db");
    });

    try {
        // --- HELPERS ---
        const query = (sql: string): Promise<any[]> => {
            return new Promise((resolve, reject) => {
                legacyDb.all(sql, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
        };

        // --- LISTAR TABELAS (DEBUG) ---
        const tables = await query("SELECT name FROM sqlite_master WHERE type='table'");
        console.log("📊 Tabelas encontradas no legacy.db:", tables.map(t => t.name).join(', '));

        // --- 1. MIGRAR USERS ---
        console.log("\n👤 Migrando Usuários...");
        try {
            const users = await query("SELECT * FROM users");
            console.log(`   -> ${users.length} usuários encontrados.`);

            let usersMigrated = 0;
            for (const u of users) {
                // Mapear campos (ajustar conforme nomes reais das colunas no legacy)
                const matricula = String(u.matricula || u.id); // Fallback

                await prisma.user.upsert({
                    where: { matricula },
                    update: {
                        name: u.name,
                        role: u.role,
                        shift: String(u.shift || '1'),
                        email: u.email,
                        password: u.password,
                        isAdmin: u.isAdmin === 1 || u.is_admin === 1 || u.isAdmin === true
                    },
                    create: {
                        matricula,
                        name: u.name,
                        role: u.role,
                        shift: String(u.shift || '1'),
                        email: u.email,
                        password: u.password,
                        isAdmin: u.isAdmin === 1 || u.is_admin === 1 || u.isAdmin === true
                    }
                });
                usersMigrated++;
            }
            console.log(`✅ ${usersMigrated} usuários migrados.`);
        } catch (e: any) {
            console.warn(`⚠️ Erro ao migrar usuários (pode ser que a tabela não exista): ${e.message}`);
        }

        // --- 2. MIGRAR CONFIGS ---
        console.log("\n⚙️ Migrando Configurações...");

        const migrateConfig = async (tableName: string, prismaModel: any, fieldName: string = 'name') => {
            try {
                const items = await query(`SELECT * FROM ${tableName}`);
                let count = 0;
                for (const item of items) {
                    const val = item[fieldName] || item.name || item.id;
                    if (!val) continue;

                    // Prisma dynamic model access
                    await prismaModel.upsert({
                        where: { name: val },
                        update: {},
                        create: { name: val }
                    });
                    count++;
                }
                console.log(`   -> ${tableName}: ${count} registros.`);
            } catch (e: any) {
                console.log(`   -> (Skip) Tabela ${tableName} não encontrada ou vazia.`);
            }
        };

        // Tentar nomes prováveis de tabelas de config
        await migrateConfig('config_lines', prisma.configLine);
        await migrateConfig('lines', prisma.configLine); // Tentativa fallback

        await migrateConfig('config_roles', prisma.configRole);
        await migrateConfig('roles', prisma.configRole);

        await migrateConfig('config_models', prisma.configModel);
        await migrateConfig('models', prisma.configModel);

        await migrateConfig('config_stations', prisma.configStation);
        await migrateConfig('stations', prisma.configStation);


        // --- 3. MIGRAR SCRAP (CRÍTICO) ---
        console.log("\n🗑️ Migrando ScrapLog...");
        try {
            // Tenta 'scrap_data' ou 'scraps'
            let scraps = [];
            try { scraps = await query("SELECT * FROM scrap_data"); }
            catch { scraps = await query("SELECT * FROM scraps"); }

            console.log(`   -> ${scraps.length} registros de scrap encontrados.`);

            let scrapCount = 0;
            const scrapBatch = [];

            for (const s of scraps) {
                // TRANSFORMATIONS
                // Ignorar ID antigo (s.id) para deixar o auto-increment do PostgreSQL/SQLite (Prisma) atuar

                const newScrap = {
                    userId: s.userId || s.user_id,
                    date: s.date,
                    time: s.time,
                    week: s.week ? Number(s.week) : null,
                    shift: s.shift ? String(s.shift) : null,
                    leaderName: s.leaderName || s.leader_name,
                    pqc: s.pqc,
                    model: s.model,
                    qty: s.qty ? Number(s.qty) : 0,
                    item: s.item,
                    status: s.status,
                    code: s.code,
                    description: s.description,
                    unitValue: s.unitValue || s.unit_value ? Number(s.unitValue || s.unit_value) : 0,
                    totalValue: s.totalValue || s.total_value ? Number(s.totalValue || s.total_value) : 0,
                    usedModel: s.usedModel || s.used_model,
                    responsible: s.responsible,
                    station: s.station,
                    reason: s.reason,
                    rootCause: s.rootCause || s.root_cause || s.rootcause, // Tentar variações
                    countermeasure: s.countermeasure,
                    line: s.line
                };

                // Remove undefined keys to avoid prisma errors
                Object.keys(newScrap).forEach(key => (newScrap as any)[key] === undefined && delete (newScrap as any)[key]);

                // Inserir um a um para garantir segurança de tipos ou usar createMany
                // No SQLite, createMany é limitado, mas melhor fazer loop com try/catch para garantir integridade
                try {
                    await prisma.scrapLog.create({ data: newScrap });
                    scrapCount++;
                } catch (insertErr: any) {
                    console.error(`      ❌ Erro item scrap antigo ID ${s.id}: ${insertErr.message}`);
                }
            }
            console.log(`✅ ${scrapCount} Scraps inseridos com sucesso.`);

        } catch (e: any) {
            console.error(`⚠️ Erro fatal na migração de Scraps: ${e.message}`);
        }


        // --- 4. MIGRAR LOGS (LIDER/MANUTENCAO) ---
        console.log("\n📋 Migrando Logs (Checklists)...");

        async function migrateChecklistLogs(sourceTable: string, prismaModel: any) {
            try {
                const logs = await query(`SELECT * FROM ${sourceTable}`);
                console.log(`   -> Migrando ${sourceTable} (${logs.length} registros)...`);

                let success = 0;
                for (const l of logs) {
                    try {
                        // Converter snapshots JSON se vierem como objeto do driver ou string
                        let itemsSnapshotStr = l.itemsSnapshot || l.items_snapshot;
                        if (typeof itemsSnapshotStr === 'object') itemsSnapshotStr = JSON.stringify(itemsSnapshotStr);

                        let dataStr = l.data;
                        if (typeof dataStr === 'object') dataStr = JSON.stringify(dataStr);

                        const newLog = {
                            // id: ignorar para auto-increment
                            userId: l.userId || l.user_id,
                            userName: l.userName || l.user_name,
                            userRole: l.userRole || l.user_role,
                            line: l.line,
                            date: l.date,
                            itemsCount: l.itemsCount || l.items_count ? Number(l.itemsCount || l.items_count) : 0,
                            ngCount: l.ngCount || l.ng_count ? Number(l.ngCount || l.ng_count) : 0,
                            observation: l.observation,
                            data: dataStr, // JSON String
                            itemsSnapshot: itemsSnapshotStr, // JSON String
                            // maintenance fields (only used if model matches, prisma ignores extras in 'data' object literal if typed strictly, but here we construct manual)
                        };

                        if (sourceTable.includes('manutencao')) {
                            (newLog as any).maintenanceTarget = l.maintenanceTarget || l.maintenance_target;
                        }

                        await prismaModel.create({ data: newLog });
                        success++;
                    } catch (err: any) {
                        console.error(`      ❌ Falha log antigo ID ${l.id}: ${err.message}`);
                    }
                }
                console.log(`      ✅ ${success} inseridos em ${sourceTable}.`);
            } catch (e) {
                console.log(`      ℹ️ Tabela ${sourceTable} não encontrada.`);
            }
        }

        await migrateChecklistLogs('logs_lider', prisma.log);
        await migrateChecklistLogs('logs_manutencao', prisma.maintenanceLog);


        // --- 5. MIGRAR MEETINGS (NOVO) ---
        async function migrateMeetings() {
            try {
                console.log("\n📅 Migrando Meetings...");
                // Tentar nome da tabela 'meetings'
                let meetings: any[] = [];
                try {
                    meetings = await query("SELECT * FROM meetings");
                } catch (e) {
                    // Try plural/singular
                    try { meetings = await query("SELECT * FROM meeting"); } catch { }
                }

                console.log(`   -> ${meetings.length} reuniões encontradas.`);
                let count = 0;

                for (const m of meetings) {
                    try {
                        // Adaptação dos campos do legacy para o schema Prisma
                        const participantsStr = typeof m.participants === 'object'
                            ? JSON.stringify(m.participants)
                            : (m.participants || "[]");

                        const newMeeting = {
                            id: String(m.id), // Manter ID original string
                            title: m.title,
                            date: m.date,
                            startTime: m.start_time || m.startTime,
                            endTime: m.end_time || m.endTime,
                            photoUrl: m.photo_url || m.photo_url || m.photoUrl || "",
                            topics: m.topics,
                            createdBy: m.created_by || m.createdBy,
                            participants: participantsStr
                        };

                        // UPSERT para evitar duplicata se rodar de novo
                        await prisma.meeting.upsert({
                            where: { id: newMeeting.id },
                            update: newMeeting,
                            create: newMeeting
                        });
                        count++;
                    } catch (err: any) {
                        console.error(`      ❌ Erro Meeting ID ${m.id}: ${err.message}`);
                    }
                }
                console.log(`✅ ${count} reuniões migradas.`);

            } catch (e: any) {
                console.log("⚠️ Tabela 'meetings' não encontrada ou vazia no legacy.db.");
            }
        }

        await migrateMeetings();

    } catch (err: any) {
        console.error("\n❌ Erro geral na migração:", err);
    } finally {
        legacyDb.close();
        await prisma.$disconnect();
        console.log("\n🏁 Migração finalizada.");
    }
}

main();
