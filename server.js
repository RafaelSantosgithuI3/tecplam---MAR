const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const os = require('os');
const { PrismaClient } = require('@prisma/client');
// const sqlite3 = require('sqlite3').verbose(); // Removed

const compression = require('compression');

const app = express();
const prisma = new PrismaClient({
    log: ['error', 'warn'], // Optional: Add 'query' for debugging
});

// OTIMIZAÇÃO 1: SQLite WAL Mode (Evita travamentos em HD lento)
async function enableWAL() {
    try {
        await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
        await prisma.$queryRawUnsafe('PRAGMA synchronous = NORMAL;'); // Menos flush no disco
        console.log('⚡ SQLite WAL Mode Enabled (Optimized for HDD)');
    } catch (e) {
        console.error('Failed to enable WAL', e);
    }
}
enableWAL();

let SCRAP_CACHE = null; // In-Memory Cache for Scraps

const loadScrapCache = async () => {
    console.log("🔄 Carregando Scraps para a RAM...");
    try {
        // WAL Mode is enabled globally at start


        SCRAP_CACHE = await prisma.scrapLog.findMany({
            orderBy: [{ date: 'desc' }, { time: 'desc' }]
        });
        console.log(`✅ Cache carregado: ${SCRAP_CACHE.length} registros.`);
    } catch (e) {
        console.error("❌ Erro ao carregar cache de scraps:", e);
        SCRAP_CACHE = []; // Fallback to empty array to prevent null errors
    }
};

const PORT = 3000;
const SALT_ROUNDS = 10;

// Middleware
app.use(compression()); // OTIMIZAÇÃO 2: Compressão Gzip (Reduz tráfego de rede)
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// --- ROTAS DE USUÁRIOS ---

app.post('/api/login', async (req, res) => {
    const { matricula, password } = req.body;
    try {
        const user = await prisma.user.findUnique({
            where: { matricula: String(matricula) }
        });

        if (!user) return res.status(401).json({ error: "Usuário não encontrado" });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ error: "Senha incorreta" });

        const userResponse = { ...user, isAdmin: !!user.isAdmin };
        delete userResponse.password; // Remove password from response

        res.json({ user: userResponse });
    } catch (e) {
        console.error("Login Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/register', async (req, res) => {
    const { matricula, name, role, shift, email, password } = req.body;
    try {
        const hash = await bcrypt.hash(password, SALT_ROUNDS);
        await prisma.user.create({
            data: {
                matricula: String(matricula),
                name,
                role,
                shift,
                email,
                password: hash,
                isAdmin: false
            }
        });
        res.json({ message: "Criado" });
    } catch (e) {
        console.error("Register Error:", e);
        res.status(400).json({ error: "Erro cadastro (matricula já existe?)" });
    }
});

app.post('/api/recover', async (req, res) => {
    const { matricula, name, role } = req.body;
    try {
        const user = await prisma.user.findUnique({
            where: { matricula: String(matricula) }
        });

        if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

        await prisma.recoveryRequest.create({
            data: {
                matricula: String(matricula),
                name,
                role,
                status: 'PENDING'
            }
        });

        res.json({ message: "Solicitação enviada ao Administrador. Aguarde o contato." });
    } catch (e) {
        console.error("Recover Request Error:", e);
        res.status(500).json({ error: "Erro ao enviar solicitação" });
    }
});

app.put('/api/users', async (req, res) => {
    const { matricula, name, role, shift, email, password, isAdmin, originalMatricula } = req.body;
    const target = originalMatricula || matricula;

    try {
        const data = {
            matricula,
            name,
            role,
            shift,
            email,
            isAdmin: !!isAdmin
        };

        if (password && password !== '******') {
            data.password = await bcrypt.hash(password, SALT_ROUNDS);
        }

        await prisma.user.update({
            where: { matricula: String(target) },
            data
        });

        res.json({ message: "Atualizado" });
    } catch (e) {
        console.error("Update User Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/users', async (req, res) => {
    try {
        const users = await prisma.user.findMany();
        const safeUsers = users.map(u => ({
            ...u,
            password: '******',
            isAdmin: !!u.isAdmin
        }));
        res.json(safeUsers);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        await prisma.user.delete({
            where: { matricula: req.params.id }
        });
        res.json({ message: "Deletado" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ADMIN RECOVERY ROUTES
app.get('/api/admin/recovery-requests', async (req, res) => {
    try {
        const requests = await prisma.recoveryRequest.findMany({
            where: { status: 'PENDING' },
            orderBy: { createdAt: 'desc' }
        });
        res.json(requests);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/admin/reset-password', async (req, res) => {
    const { requestId, matricula, newPassword } = req.body;
    try {
        const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);

        // Transaction to update user password and close request
        await prisma.$transaction([
            prisma.user.update({
                where: { matricula: String(matricula) },
                data: { password: hash }
            }),
            prisma.recoveryRequest.update({
                where: { id: requestId },
                data: { status: 'COMPLETED' }
            })
        ]);

        res.json({ message: "Senha redefinida com sucesso" });
    } catch (e) {
        console.error("Admin Reset Error:", e);
        res.status(500).json({ error: "Erro ao redefinir senha" });
    }
});

// --- LOGS & CHECKLISTS ---

app.get('/api/logs', async (req, res) => {
    try {
        const [liderLogs, maintLogs] = await Promise.all([
            prisma.log.findMany({
                orderBy: { date: 'desc' },
                take: 500
            }),
            prisma.maintenanceLog.findMany({
                orderBy: { date: 'desc' },
                take: 500
            })
        ]);

        const formatLog = (r, type) => {
            let parsedData = {};
            let parsedSnapshot = [];
            try { parsedData = JSON.parse(r.data || '{}'); } catch (e) { }
            try { parsedSnapshot = JSON.parse(r.itemsSnapshot || '[]'); } catch (e) { }

            return {
                id: r.id.toString(),
                userId: r.userId,
                userName: r.userName,
                userRole: r.userRole,
                line: r.line,
                date: r.date,
                itemsCount: r.itemsCount,
                ngCount: r.ngCount,
                observation: r.observation,
                data: parsedData.answers || parsedData,
                evidenceData: parsedData.evidence || {},
                type: type,
                maintenanceTarget: r.maintenanceTarget || parsedData.maintenanceTarget,
                itemsSnapshot: parsedSnapshot
            };
        };

        const allLogs = [
            ...liderLogs.map(l => formatLog(l, 'PRODUCTION')),
            ...maintLogs.map(l => formatLog(l, 'MAINTENANCE'))
        ].sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json(allLogs);
    } catch (e) {
        console.error("Get Logs Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/logs', async (req, res) => {
    const { userId, userName, userRole, line, date, itemsCount, ngCount, observation, data, evidenceData, type, maintenanceTarget, itemsSnapshot } = req.body;

    const storageObject = { answers: data, evidence: evidenceData, type: type || 'PRODUCTION', maintenanceTarget };
    const dataStr = JSON.stringify(storageObject);
    const snapshotStr = itemsSnapshot ? JSON.stringify(itemsSnapshot) : '[]';

    try {
        if (type === 'MAINTENANCE') {
            await prisma.maintenanceLog.create({
                data: {
                    userId, userName, userRole, line, date,
                    itemsCount, ngCount, observation,
                    data: dataStr,
                    maintenanceTarget,
                    itemsSnapshot: snapshotStr
                }
            });
        } else {
            await prisma.log.create({
                data: {
                    userId, userName, userRole, line, date,
                    itemsCount, ngCount, observation,
                    data: dataStr,
                    itemsSnapshot: snapshotStr
                }
            });
        }
        res.json({ message: "Salvo" });
    } catch (e) {
        console.error("Save Log Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// --- ITEMS DE CONFIGURAÇÃO DO CHECKLIST ---

app.get('/api/config/items', async (req, res) => {
    try {
        const [liderItems, maintItems] = await Promise.all([
            prisma.checklistItem.findMany(),
            prisma.maintenanceChecklistItem.findMany()
        ]);

        const mapItem = (item, type) => ({
            id: item.id.toString(),
            category: item.category,
            text: item.text,
            evidence: item.evidence,
            imageUrl: item.imageUrl,
            type
        });

        res.json([
            ...liderItems.map(i => mapItem(i, 'LEADER')),
            ...maintItems.map(i => mapItem(i, 'MAINTENANCE'))
        ]);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/config/items', async (req, res) => {
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: "Invalid items format" });

    try {
        await prisma.$transaction(async (tx) => {
            // Delete all existing items
            await tx.checklistItem.deleteMany();
            await tx.maintenanceChecklistItem.deleteMany();

            // Insert new items
            for (const i of items) {
                const itemData = {
                    category: i.category,
                    text: i.text,
                    evidence: i.evidence || '',
                    imageUrl: i.imageUrl || ''
                };

                if (i.type === 'MAINTENANCE') {
                    await tx.maintenanceChecklistItem.create({ data: itemData });
                } else {
                    await tx.checklistItem.create({ data: itemData });
                }
            }
        });
        res.json({ message: "Salvo" });
    } catch (e) {
        console.error("Save Config Items Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// --- PARADA DE LINHA (LINE STOPS) ---

app.get('/api/line-stops', async (req, res) => {
    try {
        const stops = await prisma.lineStop.findMany({
            orderBy: { date: 'desc' },
            take: 500
        });

        res.json(stops.map(r => {
            let parsed = {};
            try { parsed = JSON.parse(r.data || '{}'); } catch (e) { parsed = {}; }

            return {
                ...r,
                // Ensure ID is string for frontend compatibility
                id: r.id.toString(),
                type: 'LINE_STOP',
                data: parsed,
                itemsCount: 0,
                ngCount: 0,
                observation: ''
            };
        }));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/line-stops', async (req, res) => {
    const { id, userId, userName, userRole, line, date, status, data, signedDocUrl } = req.body;
    const dataStr = typeof data === 'object' ? JSON.stringify(data) : data;
    const finalStatus = status || 'WAITING_JUSTIFICATION';

    try {
        // Since sqlite doesn't support easy 'upsert' with non-unique non-id fields easily if ID is auto-increment but passed manually...
        // Actually ID in LineStop is auto-increment Int.
        // Frontend sends string ID sometimes (timestamp). 
        // Need to check schema. ID is Int @default(autoincrement()).
        // If frontend sends 'id' and it expects to update, we need to handle that.
        // If frontend sends 'id' as a timestamp string, this will fail on Int column.

        // CHECK MIGRATION: The legacy code created table with 'id INTEGER PRIMARY KEY AUTOINCREMENT'.
        // But the legacy POST route logic was: `const newId = id || Date.now().toString();` and inserted it.
        // SQLite allows inserting integers into PK manually.
        // The issue is types. If 'id' from body is string date '1738...', it fits in BigInt/Int potentially but Prisma maps Int to JS number.
        // Let's assume ID is number.

        // ID is now String (UUID) handled by Prisma @default(uuid()) or passed as string
        // If updating, 'id' is passed.

        if (id) {
            const existing = await prisma.lineStop.findUnique({ where: { id: String(id) } });
            if (existing) {
                await prisma.lineStop.update({
                    where: { id: String(id) },
                    data: {
                        line,
                        status: finalStatus,
                        data: dataStr,
                        signedDocUrl: signedDocUrl || null
                    }
                });
                return res.json({ message: "Salvo com sucesso" });
            }
        }

        // Create new
        await prisma.lineStop.create({
            data: {
                // Let autoincrement handle ID unless we need to force it.
                // Legacy code forced ID. For Prisma, better to let DB handle it.
                userId, userName, userRole, line, date,
                status: finalStatus,
                data: dataStr,
                signedDocUrl: signedDocUrl || null
            }
        });

        res.json({ message: "Salvo com sucesso" });
    } catch (e) {
        console.error("Save Stop Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// --- CONFIGS (Roles, Lines, etc) ---

// Roles
app.get('/api/config/roles', async (req, res) => {
    try {
        const roles = await prisma.configRole.findMany();
        // Return name as ID since that's what the schema uses
        res.json(roles.map(r => ({ id: r.name, name: r.name })));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/config/roles', async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Nome obrigatório" });
    try {
        await prisma.configRole.create({ data: { name } });
        res.json({ message: "Cargo salvo" });
    } catch (e) {
        // Unique constraint violation?
        res.json({ message: "Cargo salvo/já existe" });
    }
});

app.delete('/api/config/roles/:id', async (req, res) => {
    try {
        // ID passed is actually the name
        await prisma.configRole.delete({
            where: { name: req.params.id }
        });
        res.json({ message: "Cargo deletado" });
    } catch (e) {
        res.status(500).json({ error: "Erro ao deletar: " + e.message });
    }
});

// Lines
app.get('/api/config/lines', async (req, res) => {
    try {
        const lines = await prisma.configLine.findMany();
        // Return name as ID since that's what the schema uses
        res.json(lines.map(l => ({ id: l.name, name: l.name })));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/config/lines', async (req, res) => {
    const { name } = req.body;
    try {
        await prisma.configLine.create({ data: { name } });
        res.json({ message: "Linha salva" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/config/lines/:id', async (req, res) => {
    try {
        await prisma.configLine.delete({
            where: { name: req.params.id }
        });
        res.json({ message: "Linha deletada" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Generic Configs (Models, Stations)
const createConfigRoutes = (modelDelegate, pathName) => {
    app.get(`/api/config/${pathName}`, async (req, res) => {
        try {
            const items = await modelDelegate.findMany();
            res.json(items);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.post(`/api/config/${pathName}`, async (req, res) => {
        const { items } = req.body;
        try {
            await prisma.$transaction(async (tx) => {
                // This helper logic is tricky with delegates.
                // We'll just use manual code since we can't easily pass delegate model generic in JS
                // Actually we can pass 'prisma.configModel'
                // But replace 'tx' usage
                // Let's just hardcode the logic inside the route handler closure

                // Get the correct delegate from transaction client 'tx'
                const delegate = tx[modelDelegate]; // modelDelegate should be string name like 'configModel'

                await delegate.deleteMany();
                for (const item of items) {
                    await delegate.create({ data: { name: item } });
                }
            });
            res.json({ message: "Salvo" });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });
};

// We need to define routes manually to use the string key for model
app.get('/api/config/models', async (req, res) => res.json(await prisma.configModel.findMany()));
app.post('/api/config/models', async (req, res) => {
    try {
        await prisma.$transaction(async tx => {
            await tx.configModel.deleteMany();
            for (const i of req.body.items) {
                const name = typeof i === 'string' ? i : i.name;
                const sku = typeof i === 'object' ? i.sku : undefined;
                await tx.configModel.create({ data: { name, sku } });
            }
        });
        res.json({ message: "Salvo" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/config/stations', async (req, res) => res.json(await prisma.configStation.findMany()));
app.post('/api/config/stations', async (req, res) => {
    try {
        await prisma.$transaction(async tx => {
            await tx.configStation.deleteMany();
            for (const i of req.body.items) await tx.configStation.create({ data: { name: i } });
        });
        res.json({ message: "Salvo" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});


app.get('/api/config/permissions', async (req, res) => {
    try {
        const perms = await prisma.configPermission.findMany();
        res.json(perms.map(p => ({
            role: p.role,
            module: p.module,
            allowed: p.allowed === 1
        })));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/config/permissions', async (req, res) => {
    const { permissions } = req.body;
    try {
        await prisma.$transaction(async tx => {
            await tx.configPermission.deleteMany();
            for (const p of permissions) {
                await tx.configPermission.create({
                    data: {
                        role: p.role,
                        module: p.module,
                        allowed: p.allowed ? 1 : 0
                    }
                });
            }
        });
        res.json({ message: "Salvo" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- MEETINGS ---

app.get('/api/meetings', async (req, res) => {
    try {
        const rawMeetings = await prisma.meeting.findMany({
            orderBy: { date: 'desc' }
        });
        // MAP: Parse participants JSON string to Array
        const formattedMeetings = rawMeetings.map(m => ({
            ...m,
            participants: typeof m.participants === 'string'
                ? JSON.parse(m.participants || "[]")
                : (m.participants || [])
        }));

        res.json(formattedMeetings);
    } catch (error) {
        console.error("❌ ERRO CRÍTICO EM MEETINGS:", error);
        res.status(500).json({ error: "Erro interno ao buscar reuniões." });
    }
});

app.post('/api/meetings', async (req, res) => {
    const { id, title, date, startTime, endTime, photoUrl, participants, topics, createdBy } = req.body;
    try {
        await prisma.meeting.create({
            data: {
                id,
                title: title || '',
                date,
                startTime,
                endTime,
                photoUrl,
                participants: JSON.stringify(participants),
                topics,
                createdBy
            }
        });
        res.json({ message: "Ata Salva" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- PREPARATION LOG ---

app.get('/api/preparation-logs', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 500;
        const offset = parseInt(req.query.skip) || 0;

        const logs = await prisma.preparationLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset
        });
        res.json(logs);
    } catch (e) {
        console.error("Get Preparation Logs Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/preparation-logs', async (req, res) => {
    try {
        const { id, current, rfCal, ...data } = req.body;

        const parseIntOrNull = (val) => (val === "" || val === null || val === undefined) ? null : parseInt(val);
        const parseFloatOrNull = (val) => (val === "" || val === null || val === undefined) ? null : parseFloat(val);

        // Map and parse
        const cleanData = {};
        const intFields = ['plate', 'rear', 'btFt', 'pba', 'input', 'preKey', 'lcia', 'audio', 'radiation', 'imei', 'vct', 'revision', 'desmonte', 'oven', 'repair'];

        // Loop over remaining fields
        for (const key in data) {
            if (intFields.includes(key)) {
                cleanData[key] = parseIntOrNull(data[key]);
            } else if (key === 'currentRfCal') {
                cleanData[key] = parseFloatOrNull(data[key]);
            } else if (key === 'observation' || key === 'model' || key === 'line' || key === 'date' || key === 'shift' || key === 'responsible' || key === 'sku') {
                // Keep as is (string) but sanitize empty if nullable? Sku/observation are nullable.
                if (key === 'sku' || key === 'observation') {
                    cleanData[key] = (data[key] === "") ? null : data[key];
                } else {
                    cleanData[key] = data[key];
                }
            }
        }

        // Handle legacy current/rfCal mapping if needed (or just use correct field)
        if (cleanData.currentRfCal === undefined || cleanData.currentRfCal === null) {
            // Look for 'current' or 'rfCal' in original body just in case
            if (current) cleanData.currentRfCal = parseFloatOrNull(current);
            else if (rfCal) cleanData.currentRfCal = parseFloatOrNull(rfCal);
        }

        await prisma.preparationLog.create({
            data: {
                ...cleanData,
                date: data.date,
                shift: data.shift,
                line: data.line,
                model: data.model,
                sku: data.sku || null, // Ensure sku is passed
                responsible: data.responsible,
                createdAt: new Date()
            }
        });
        res.json({ message: "Salvo" });
    } catch (e) {
        console.error("Save Preparation Log Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// --- SCRAP ---

app.get('/api/scraps', async (req, res) => {
    try {
        if (!SCRAP_CACHE) {
            await loadScrapCache();
        }
        res.json(SCRAP_CACHE);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/scraps', async (req, res) => {
    try {
        const { id, ...rest } = req.body; // Remove ID to let DB autoincrement

        // Logic: Find Plant from Material
        // Logic: Find Plant from Material (Always prioritize DB)
        let plantToSave = 'ND';
        if (rest.code) {
            const material = await prisma.material.findUnique({ where: { code: String(rest.code) } });
            if (material && material.plant) {
                plantToSave = material.plant;
            } else if (rest.plant) {
                plantToSave = rest.plant; // Fallback to provided plant if validation fails or code not found
            }
        } else if (rest.plant) {
            plantToSave = rest.plant;
        }

        const newScrap = await prisma.scrapLog.create({
            data: {
                userId: rest.userId,
                date: rest.date,
                time: rest.time,
                week: Number(rest.week) || null,
                shift: rest.shift ? String(rest.shift) : null,
                leaderName: rest.leaderName,
                pqc: rest.pqc,
                model: rest.model,
                qty: Number(rest.qty) || 0,
                item: rest.item,
                status: rest.status,
                code: rest.code,
                description: rest.description,
                unitValue: Number(rest.unitValue) || 0,
                totalValue: Number(rest.totalValue) || 0,
                usedModel: rest.usedModel,
                responsible: rest.responsible,
                station: rest.station,
                reason: rest.reason,
                rootCause: rest.rootCause,
                countermeasure: rest.countermeasure || null,
                line: rest.line,
                plant: plantToSave,
                situation: 'PENDING'
            }
        });

        // Write-Through Cache
        if (SCRAP_CACHE) {
            SCRAP_CACHE.unshift(newScrap);
        }

        res.json({ message: "Scrap salvo" });
    } catch (e) {
        console.error("Scrap Create Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/scraps/:id', async (req, res) => {
    const { id } = req.params;
    const numericId = parseInt(id, 10);
    if (isNaN(numericId)) return res.status(400).json({ error: "Invalid ID" });

    const updates = req.body;
    const dataToUpdate = {};

    // Fields mapping and type conversion
    if (updates.date !== undefined) dataToUpdate.date = updates.date;
    if (updates.time !== undefined) dataToUpdate.time = updates.time;
    if (updates.week !== undefined) dataToUpdate.week = Number(updates.week);
    if (updates.shift !== undefined) dataToUpdate.shift = String(updates.shift);
    if (updates.leaderName !== undefined) dataToUpdate.leaderName = updates.leaderName;
    if (updates.pqc !== undefined) dataToUpdate.pqc = updates.pqc;
    if (updates.model !== undefined) dataToUpdate.model = updates.model;
    if (updates.qty !== undefined) dataToUpdate.qty = Number(updates.qty);
    if (updates.item !== undefined) dataToUpdate.item = updates.item;
    if (updates.status !== undefined) dataToUpdate.status = updates.status;
    if (updates.code !== undefined) dataToUpdate.code = updates.code;
    if (updates.description !== undefined) dataToUpdate.description = updates.description;
    if (updates.unitValue !== undefined) dataToUpdate.unitValue = Number(updates.unitValue);
    if (updates.totalValue !== undefined) dataToUpdate.totalValue = Number(updates.totalValue);
    if (updates.usedModel !== undefined) dataToUpdate.usedModel = updates.usedModel;
    if (updates.responsible !== undefined) dataToUpdate.responsible = updates.responsible;
    if (updates.station !== undefined) dataToUpdate.station = updates.station;
    if (updates.reason !== undefined) dataToUpdate.reason = updates.reason;
    if (updates.rootCause !== undefined) dataToUpdate.rootCause = updates.rootCause;
    if (updates.countermeasure !== undefined) dataToUpdate.countermeasure = updates.countermeasure;
    if (updates.line !== undefined) dataToUpdate.line = updates.line;
    if (updates.plant !== undefined) dataToUpdate.plant = updates.plant;
    if (updates.nfNumber !== undefined) dataToUpdate.nfNumber = updates.nfNumber;
    if (updates.sentBy !== undefined) dataToUpdate.sentBy = updates.sentBy;
    if (updates.sentAt !== undefined) dataToUpdate.sentAt = new Date(updates.sentAt);

    // Handle snake_case inputs if coming from raw JSON manually
    if (updates.leader_name !== undefined) dataToUpdate.leaderName = updates.leader_name;
    if (updates.total_value !== undefined) dataToUpdate.totalValue = Number(updates.total_value);

    // If nothing to update, return early
    // EXCEPTION: If we are saving from Edit Modal, we might want to force update even if no fields changed, 
    // but usually fields change. However, for the 'tracking' requirement, we always update time/user if requested.

    // NEW RULE: Traceability & Edit Override
    // If userId is provided in updates, it means we are editing and want to override author.
    // Also update time to current server time.
    if (updates.userId) {
        dataToUpdate.userId = updates.userId;
        const now = new Date();
        // Server time HH:MM
        dataToUpdate.time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    }

    if (Object.keys(dataToUpdate).length === 0) return res.json({ message: "Nada a atualizar" });

    try {
        const updatedScrap = await prisma.scrapLog.update({
            where: { id: numericId },
            data: dataToUpdate
        });

        // Update Cache Manually (Write-Through)
        if (SCRAP_CACHE) {
            const index = SCRAP_CACHE.findIndex(s => s.id === numericId);
            if (index !== -1) {
                SCRAP_CACHE[index] = updatedScrap;
            }
        }

        res.json({ message: "Scrap atualizado" });
    } catch (e) {
        console.error("Update Scrap Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/scraps/:id', async (req, res) => {
    const { id } = req.params;
    const numericId = parseInt(id, 10);
    if (isNaN(numericId)) return res.status(400).json({ error: "Invalid ID" });

    try {
        await prisma.scrapLog.delete({
            where: { id: numericId }
        });

        // Remove from Cache
        if (SCRAP_CACHE) {
            SCRAP_CACHE = SCRAP_CACHE.filter(s => s.id !== numericId);
        }

        res.json({ message: "Scrap deletado" });
    } catch (e) {
        console.error("Delete Scrap Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// --- SCRAP BATCH PROCESS ---
app.post('/api/scraps/batch-process', async (req, res) => {
    const { scrapIds, nfNumber, userId, sentAt } = req.body;

    if (!Array.isArray(scrapIds) || scrapIds.length === 0) {
        return res.status(400).json({ error: "Nenhum ID fornecido." });
    }

    // Validate NF (Numeric, at least 1 digit)
    if (!nfNumber || !/^\d+$/.test(nfNumber)) {
        return res.status(400).json({ error: "Número da NF inválido. Apenas números são permitidos." });
    }

    try {
        const updateData = {
            nfNumber: nfNumber,
            sentBy: userId,
            sentAt: sentAt ? new Date(sentAt) : new Date(),
            situation: 'SENT'
        };

        const result = await prisma.scrapLog.updateMany({
            where: {
                id: { in: scrapIds }
            },
            data: updateData
        });

        // Update Cache
        if (SCRAP_CACHE) {
            SCRAP_CACHE = SCRAP_CACHE.map(s => {
                if (scrapIds.includes(s.id)) {
                    return { ...s, ...updateData, sentAt: updateData.sentAt };
                }
                return s;
            });
        }

        res.json({ message: `${result.count} registros atualizados com a NF ${nfNumber}` });
    } catch (e) {
        console.error("Batch Process Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// --- SCRAP MATERIALS ---

app.get('/api/materials', async (req, res) => {
    try {
        const materials = await prisma.material.findMany({
            orderBy: { model: 'asc' }
        });
        res.json(materials);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/materials/bulk', async (req, res) => {
    const { materials } = req.body;
    if (!materials || !Array.isArray(materials)) {
        return res.status(400).json({ error: 'Array de materiais obrigatório' });
    }

    try {
        await prisma.$transaction(async (tx) => {
            // Upsert each material
            for (const m of materials) {
                await tx.material.upsert({
                    where: { code: String(m.code) },
                    update: {
                        model: m.model,
                        description: m.description,
                        item: m.item,
                        plant: m.plant,
                        price: m.price
                    },
                    create: {
                        code: String(m.code),
                        model: m.model,
                        description: m.description,
                        item: m.item,
                        plant: m.plant,
                        price: m.price
                    }
                });
            }
        });
        res.json({ success: true, count: materials.length });
    } catch (e) {
        console.error("Bulk Material Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// --- FILES & BACKUP ---

app.post('/api/backup/save', (req, res) => {
    const { fileName, fileData } = req.body;
    const backupsDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir);
    const filePath = path.join(backupsDir, fileName);
    const base64Data = fileData.split(';base64,').pop();
    fs.writeFile(filePath, base64Data, { encoding: 'base64' }, (err) => {
        if (err) return res.status(500).json({ error: "Erro no servidor" });
        res.json({ message: "Salvo", path: filePath });
    });
});

app.get('/api/admin/backup', (req, res) => {
    const dbPath = path.join(__dirname, 'prisma', 'lidercheck.db');
    if (fs.existsSync(dbPath)) res.download(dbPath, 'lidercheck_backup.db');
    else res.status(404).json({ error: "DB não encontrado" });
});

// --- STATIC SERVER (OTIMIZAÇÃO 3: Cache Estático Longo) ---
const distPath = path.join(__dirname, 'dist');

// Servir arquivos estáticos com Cache Longo (1 ano) para aliviar o HD
app.use(express.static(distPath, {
    maxAge: '1y',
    etag: false
}));
app.get('*', (req, res) => {
    const indexFile = path.join(distPath, 'index.html');
    if (fs.existsSync(indexFile)) res.sendFile(indexFile);
    else res.send('Frontend não buildado (npm run build).');
});

function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return 'localhost';
}

console.log("🚀 Iniciando servidor...");
// Warm-up Cache before listening matches user request "Chame essa função assim que o servidor iniciar (antes do app.listen)"
loadScrapCache().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ SERVIDOR RODANDO! (Prisma ORM | RAM Cache Enabled)`);
        console.log(`--------------------------------------------------`);
        console.log(`💻 ACESSO LOCAL:     http://localhost:${PORT}`);
        console.log(`📱 ACESSO NA REDE:   http://${getLocalIp()}:${PORT}`);
        console.log(`--------------------------------------------------`);
        console.log(`Conectado ao database via Prisma.`);
    });
});