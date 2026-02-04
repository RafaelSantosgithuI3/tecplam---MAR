const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./lidercheck.db');

db.serialize(() => {
    console.log("Iniciando limpeza de dados corrompidos...");

    // Limpa LineStops com ID nulo ou vazio
    db.run("DELETE FROM line_stops WHERE id IS NULL OR id = ''", function (err) {
        if (err) console.error(err);
        else console.log(`LineStops removidos: ${this.changes}`);
    });

    // Limpa Meetings com ID nulo ou vazio
    db.run("DELETE FROM meetings WHERE id IS NULL OR id = ''", function (err) {
        if (err) console.error(err);
        else console.log(`Meetings removidos: ${this.changes}`);
    });
});

db.close(() => console.log("Limpeza concluída."));
