
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Caminho absoluto para evitar confusão. O .env dizia ../lidercheck.db
// Como estamos em TECPLAM-MAR, o banco está em Documentos/lidercheck.db
const dbPath = path.resolve(__dirname, '..', '..', 'lidercheck.db');

console.log('Abrindo banco em:', dbPath);

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        console.error('Erro ao abrir banco:', err.message);
        process.exit(1);
    }
    console.log('Conectado ao banco SQLite via driver nativo.');
});

db.serialize(() => {
    // Check table schema
    db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='scrap_data'", (err, row) => {
        if (err) console.error(err);
        console.log('Schema da tabela scrap_data:', row ? row.sql : 'Tabela não encontrada');
    });

    // Check data
    db.all("SELECT id, date, leader_name FROM scrap_data LIMIT 5", (err, rows) => {
        if (err) {
            console.error('Erro ao ler dados:', err.message);
        } else {
            console.log('Registros encontrados (RAW):');
            console.log(rows);

            if (rows && rows.length > 0) {
                const typeOfId = typeof rows[0].id;
                console.log(`Tipo do ID no primeiro registro: ${typeOfId} (Valor: ${rows[0].id})`);
            }
        }
        db.close();
    });
});
