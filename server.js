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
    try {
        const { id, ...rest } = req.body; // Remove ID to let DB autoincrement

        await prisma.scrapLog.create({
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
                countermeasure: rest.countermeasure || null, // Handle undefined
                line: rest.line
            }
        });
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

    // Use Prisma field names directly or map if coming from snake_case
    const dataToUpdate = {};

    if (updates.countermeasure !== undefined) dataToUpdate.countermeasure = updates.countermeasure;
    if (updates.reason !== undefined) dataToUpdate.reason = updates.reason;
    if (updates.status !== undefined) dataToUpdate.status = updates.status;

    // Leader Name
    if (updates.leaderName !== undefined) dataToUpdate.leaderName = updates.leaderName;
    else if (updates.leader_name !== undefined) dataToUpdate.leaderName = updates.leader_name;

    // Qty
    if (updates.qty !== undefined) dataToUpdate.qty = Number(updates.qty);

    // Total Value
    if (updates.totalValue !== undefined) dataToUpdate.totalValue = Number(updates.totalValue);
    else if (updates.total_value !== undefined) dataToUpdate.totalValue = Number(updates.total_value);

    // If nothing to update, return early
    if (Object.keys(dataToUpdate).length === 0) return res.json({ message: "Nada a atualizar" });

    try {
        await prisma.scrapLog.update({
            where: { id: numericId },
            data: dataToUpdate
        });
        res.json({ message: "Scrap atualizado" });
    } catch (e) {
        console.error("Update Scrap Error:", e);
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
    const dbPath = path.join(__dirname, 'prisma', 'lidercheck.db');
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

console.log("🚀 Iniciando servidor...");
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ SERVIDOR RODANDO! (Prisma ORM)`);
    console.log(`--------------------------------------------------`);
    console.log(`💻 ACESSO LOCAL:     http://localhost:${PORT}`);
    console.log(`📱 ACESSO NA REDE:   http://${getLocalIp()}:${PORT}`);
    console.log(`--------------------------------------------------`);
    console.log(`Conectado ao database via Prisma.`);
});