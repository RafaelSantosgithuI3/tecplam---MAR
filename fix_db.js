const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./lidercheck.db');

db.serialize(() => {
    console.log("Cleaning corrupted data...");

    db.run("DELETE FROM line_stops WHERE id IS NULL OR id = ''", function (err) {
        if (err) console.error("Error cleaning line_stops:", err.message);
        else console.log(`Deleted ${this.changes} corrupted rows from line_stops`);
    });

    db.run("DELETE FROM meetings WHERE id IS NULL OR id = ''", function (err) {
        if (err) console.error("Error cleaning meetings:", err.message);
        else console.log(`Deleted ${this.changes} corrupted rows from meetings`);
    });
});

db.close(() => console.log("Cleanup finished."));
