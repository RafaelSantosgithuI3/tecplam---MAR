const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Tenta achar o banco na pasta atual OU na pai
const dbPathCurrent = path.resolve(__dirname, 'lidercheck.db');
const dbPathParent = path.resolve(__dirname, '../lidercheck.db');

let finalDbPath = '';

if (fs.existsSync(dbPathCurrent) && fs.statSync(dbPathCurrent).size > 0) {
    finalDbPath = dbPathCurrent;
} else if (fs.existsSync(dbPathParent)) {
    finalDbPath = dbPathParent;
} else {
    console.error("ERRO CRÍTICO: Banco de dados lidercheck.db não encontrado em ./ nem em ../");
    process.exit(1);
}

console.log(` Conectando ao banco REAL em: ${finalDbPath}`);

const db = new sqlite3.Database(finalDbPath);

db.serialize(() => {
    // Limpeza LineStops
    db.run("DELETE FROM line_stops WHERE id IS NULL OR id = ''", function (err) {
        if (err) console.error(err);
        else console.log(` LineStops Corrompidos Deletados: ${this.changes}`);
    });

    // Limpeza Meetings
    db.run("DELETE FROM meetings WHERE id IS NULL OR id = ''", function (err) {
        if (err) console.error(err);
        else console.log(` Meetings Corrompidos Deletados: ${this.changes}`);
    });
});

db.close();
