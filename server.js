const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const os = require('os');
const { PrismaClient } = require('@prisma/client');
// const sqlite3 = require('sqlite3').verbose(); // Removed

const app = express();
const prisma = new PrismaClient({
    log: ['error', 'warn'], // Optional: Add 'query' for debugging
});

// --- LIMPEZA NUCLEAR (VIA PRISMA) ---
async function nuclearClean() {
    console.log("☢️ INICIANDO LIMPEZA NUCLEAR VIA PRISMA...");
    try {
        // Usa a conexão do próprio Prisma para deletar sujeira
        // Isso garante que estamos limpando o MESMO arquivo que o app usa
        const resultStops = await prisma.$executeRawUnsafe(`
            DELETE FROM line_stops WHERE id IS NULL OR id = ''
        `);
        console.log(`✅ LineStops Limpos: ${resultStops} registros.`);

        const resultMeetings = await prisma.$executeRawUnsafe(`
            DELETE FROM meetings WHERE id IS NULL OR id = ''
        `);
        console.log(`✅ Meetings Limpos: ${resultMeetings} registros.`);

    } catch (e) {
        console.error("❌ FALHA NA LIMPEZA:", e);
    }
}
// ------------------------------------

const PORT = 3000;
const SALT_ROUNDS = 10;

// Middleware
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
    const { matricula, email, name, newPassword } = req.body;
    try {
        // Prisma doesn't support SQL-like LOWER() functions directly in where clause easily for SQLite without raw query
        // But we can try to find first and match in checks or use raw query if strict matching is not enough.
        // For compatibility with previous 'LOWER(TRIM(?))' logic, raw query is safest or exact match if data is clean.
        // Let's use exact match first for performance, if fails, we might need to adjust.
        // However, the previous code was very specific. Let's stick to simple findFirst for now assuming mostly correct input,
        // or fetch by matricula and validate others in JS.

        const user = await prisma.user.findUnique({
            where: { matricula: String(matricula) }
        });

        if (!user) return res.status(401).json({ error: "Dados incorretos" });

        const normalize = (s) => String(s || '').trim().toLowerCase();
        if (normalize(user.email) !== normalize(email) || normalize(user.name) !== normalize(name)) {
            return res.status(401).json({ error: "Dados incorretos" });
        }

        const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
        await prisma.user.update({
            where: { matricula: user.matricula },
            data: { password: hash }
        });

        res.json({ message: "Senha atualizada" });
    } catch (e) {
        console.error("Recover Error:", e);
        res.status(500).json({ error: "Erro servidor" });
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
        // Return simulated ID (using name as key effectively, but frontend wants id)
        res.json(roles.map((r, i) => ({ id: i + 1, name: r.name })));
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
    // Delete by Name is safer if we don't have real IDs. 
    // Legacy code used 'rowid'. 
    // Here we can't easily use rowid with Prisma.
    // If frontend sends 'rowid' as ID, we can't delete by it easily.
    // WORKAROUND: Delete doesn't work well without real ID in Prisma for this table (it has @id on name).
    // If frontend passes rowid, we are stuck.
    // But schema says `name String @id`. So we should expect DELETE /roles/:name.
    // If frontend calls /roles/123, it fails.
    // We'll try to find by name from the param if possible, or just fail.
    // Recommendation: Frontend should pass name.

    // Assuming backend refactor: We can try to match what frontend sends?
    // Let's assume frontend might send name or we can't support delete by rowid easily.
    // But wait, the schema we approved has `name` as `@id`.
    try {
        // Try deleting by name (param id might be the name)
        await prisma.configRole.delete({
            where: { name: req.params.id }
        });
        res.json({ message: "Cargo deletado" });
    } catch (e) {
        // If failed, maybe try to fetch all, find by index (rowid equivalent) and delete?
        // Risky. Let's return error.
        res.status(500).json({ error: "Erro ao deletar (use o nome como ID): " + e.message });
    }
});

// Lines
app.get('/api/config/lines', async (req, res) => {
    try {
        const lines = await prisma.configLine.findMany();
        res.json(lines.map((l, i) => ({ id: i + 1, name: l.name })));
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
        await prisma.configLine.delete({ where: { name: req.params.id } });
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
            for (const i of req.body.items) await tx.configModel.create({ data: { name: i } });
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
    console.log("📥 GET /api/meetings solicitado...");
    try {
        const rawMeetings = await prisma.meeting.findMany({
            orderBy: { date: 'desc' }
        });

        console.log(`🔎 Encontrados ${rawMeetings.length} registros.`);

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

// --- SCRAP ---

app.get('/api/scraps', async (req, res) => {
    try {
        // Order by date DESC, time DESC. 
        // string time sort might be imperfect but works for HH:MM usually.
        const scraps = await prisma.scrapLog.findMany({
            orderBy: [
                { date: 'desc' },
                { time: 'desc' }
            ]
        });
        res.json(scraps);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/scraps', async (req, res) => {
    const data = req.body;
    try {
        await prisma.scrapLog.create({
            data: {
                id: data.id || Date.now().toString(),
                userId: data.userId,
                date: data.date,
                time: data.time,
                week: data.week,
                shift: data.shift,
                leaderName: data.leaderName,
                pqc: data.pqc,
                model: data.model,
                qty: data.qty,
                item: data.item,
                status: data.status,
                code: data.code,
                description: data.description,
                unitValue: data.unitValue,
                totalValue: data.totalValue,
                usedModel: data.usedModel,
                responsible: data.responsible,
                station: data.station,
                reason: data.reason,
                rootCause: data.rootCause,
                countermeasure: data.countermeasure,
                line: data.line
            }
        });
        res.json({ message: "Scrap salvo" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/scraps/:id', async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    // Whitelist check
    const allowed = ['countermeasure', 'reason', 'status', 'leader_name', 'qty', 'total_value', 'leaderName', 'totalValue'];
    // Mapped names in prisma: leaderName, totalValue.
    // Incoming body might use camelCase or snake_case depending on frontend.
    // Previous code checked snake_case for some.
    // Let's allow updating the Prisma fields.

    // Construct data object
    const dataToUpdate = {};
    if (updates.countermeasure !== undefined) dataToUpdate.countermeasure = updates.countermeasure;
    if (updates.reason !== undefined) dataToUpdate.reason = updates.reason;
    if (updates.status !== undefined) dataToUpdate.status = updates.status;
    if (updates.leaderName !== undefined) dataToUpdate.leaderName = updates.leaderName;
    else if (updates.leader_name !== undefined) dataToUpdate.leaderName = updates.leader_name;

    if (updates.qty !== undefined) dataToUpdate.qty = updates.qty;

    if (updates.totalValue !== undefined) dataToUpdate.totalValue = updates.totalValue;
    else if (updates.total_value !== undefined) dataToUpdate.totalValue = updates.total_value;

    if (Object.keys(dataToUpdate).length === 0) return res.json({ message: "Nada a atualizar" });

    try {
        await prisma.scrapLog.update({
            where: { id },
            data: dataToUpdate
        });
        res.json({ message: "Scrap atualizado" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- MATERIALS ---

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
    const dbPath = path.join(__dirname, 'lidercheck.db');
    if (fs.existsSync(dbPath)) res.download(dbPath, 'lidercheck_backup.db');
    else res.status(404).json({ error: "DB não encontrado" });
});

// --- STATIC SERVER ---
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));
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

nuclearClean().then(async () => {
    console.log("🚀 Iniciando rotas...");
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ SERVIDOR RODANDO! (Prisma ORM)`);
        console.log(`--------------------------------------------------`);
        console.log(`💻 ACESSO LOCAL:     http://localhost:${PORT}`);
        console.log(`📱 ACESSO NA REDE:   http://${getLocalIp()}:${PORT}`);
        console.log(`--------------------------------------------------`);
        console.log(`Conectado ao database via Prisma.`);
    });
}).catch(err => {
    console.error("CRITICAL ERROR: Failed to clean DB", err);
    // Try to start anyway
    app.listen(PORT, '0.0.0.0', () => console.log("Started with errors."));
});