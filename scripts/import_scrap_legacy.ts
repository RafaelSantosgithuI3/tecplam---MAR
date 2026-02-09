
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import path from 'path';
import crypto from 'crypto';

// Initialize Prisma Client
const prisma = new PrismaClient();

// Helper to parse currency strings (e.g., "R$ 1.234,56" -> 1234.56)
function parseCurrency(value: any): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return value;

    const stringValue = String(value).trim();
    if (!stringValue) return null;

    // Remove "R$", remove thousands separator ".", replace decimal "," with "."
    // Also handle cases with multiple dots if any (though typically Brazil is 1.000,00)
    // Be careful if input is "1,000.00" (US style). But context implies "R$ 1.234,56"
    const cleaned = stringValue
        .replace(/R\$/g, '')
        .replace(/\s/g, '') // remove spaces
        .replace(/\./g, '') // remove thousands separator
        .replace(',', '.'); // replace decimal separator

    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? null : parsed;
}

// Helper to parse excel dates
// Helper to parse excel dates and return YYYY-MM-DD string
function parseDate(value: any): string | null {
    if (!value) return null;

    let dateObj: Date | null = null;

    // If it's already a JS Date object
    if (value instanceof Date) {
        dateObj = value;
    } else if (typeof value === 'string') {
        // Try to parse string DD/MM/YYYY or YYYY-MM-DD
        // Check for DD/MM/YYYY format specifically which is common in BR
        const parts = value.split('/');
        if (parts.length === 3) {
            // Assuming DD/MM/YYYY
            const day = parseInt(parts[0]);
            const month = parseInt(parts[1]) - 1;
            const year = parseInt(parts[2]);
            dateObj = new Date(Date.UTC(year, month, day, 12, 0, 0));
        } else {
            // Try standard parse
            const d = new Date(value);
            if (!isNaN(d.getTime())) {
                dateObj = d;
            }
        }
    } else if (typeof value === 'number') {
        // Excel serial date number? exceljs usually converts to Date for date cells,
        // but if it comes as number:
        // Excel base date is usually Dec 30 1899 for Mac or something, but standard is 1900.
        // It's complex to implement full Excel date logic here perfectly without library helpers,
        // but typically exceljs returns Date objects. 
        // If we get a raw number, let's treat it as epoch if large, or try to convert.
        // For now, let's assume exceljs did its job or it was a string/date.
        // If we MUST handle number: (value - 25569) * 86400 * 1000
    }

    if (dateObj) {
        // Force to noon UTC to avoid timezone rollback specific to user request
        // But since we want YYYY-MM-DD string, we can just extract UTC components if we trust the input date is loaded as UTC "00:00" by exceljs or has correct day.
        // If exceljs loaded "2023-10-01T00:00:00.000Z" and we are in GMT-4, browser might see prev day if logging, 
        // but methods like getUTCDate() are stable.

        // Strategy: Force UTC 12:00
        // Create new date using UTC components of the source, but force hour 12
        const year = dateObj.getFullYear();
        const month = dateObj.getMonth(); // 0-based
        const day = dateObj.getDate();

        // Construct a safe date at noon local (or UTC, really just want the string)
        const safeDate = new Date(Date.UTC(year, month, day, 12, 0, 0));

        // Return YYYY-MM-DD
        return safeDate.toISOString().split('T')[0];
    }

    return null; // Fallback
}

async function importScrapLegacy() {
    const fileName = 'FORPTB-13 - AcompanhamentoRejeitoProdução_Online.xlsx';
    const filePath = path.join(process.cwd(), fileName);

    console.log(`Connecting to database...`);
    console.log(`Reading Excel file: ${filePath}`);

    const workbook = new ExcelJS.Workbook();

    console.log('Cleaning existing ScrapLog data...');
    try {
        const deleted = await prisma.scrapLog.deleteMany({});
        console.log(`Deleted ${deleted.count} existing records.`);
    } catch (error) {
        console.error(`Error cleaning table: ${(error as Error).message}`);
        // Optional: decide if we should exit or continue. Usually continue is fine if table was empty or not found (though deleteMany shouldn't fail on empty).
    }

    try {
        await workbook.xlsx.readFile(filePath);
    } catch (error) {
        console.error(`Error reading file: ${(error as Error).message}`);
        process.exit(1);
    }

    const worksheet = workbook.getWorksheet(1); // Get first worksheet
    if (!worksheet) {
        console.error("Worksheet 1 not found!");
        process.exit(1);
    }

    console.log(`Worksheet loaded. Total rows in sheet: ${worksheet.rowCount}`);
    console.log(`Starting import from line 4...`);

    const recordsToInsert: any[] = [];
    let processedCount = 0;

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber < 4) return; // Skip headers (lines 1-3)

        try {
            // Mapping based on User Spec
            // B (2) -> Data
            // C (3) -> Semana
            // D (4) -> Turno
            // E (5) -> Linha
            // F (6) -> Líder (leaderName, userId)
            // G (7) -> PQC
            // H (8) -> Modelo
            // I (9) -> QTY
            // J (10) -> Item
            // K (11) -> Status
            // L (12) -> Código
            // M (13) -> Descrição
            // N (14) -> Valor Unit.
            // O (15) -> Valor TTL
            // P (16) -> Modelo Usado
            // Q (17) -> Responsável
            // R (18) -> Estação
            // S (19) -> Motivo
            // T (20) -> Causa Raiz
            // U (21) -> Contra Medida

            const getString = (idx: number) => {
                const val = row.getCell(idx).value;
                return val ? String(val).trim() : null;
            };

            const dateVal = row.getCell(2).value;
            const weekVal = row.getCell(3).value;
            const shiftVal = getString(4);
            const lineVal = getString(5);
            const leaderVal = getString(6);
            const pqcVal = getString(7);
            const modelVal = getString(8);
            const qtyVal = row.getCell(9).value; // might be number
            const itemVal = getString(10);
            const statusVal = getString(11);
            const codeVal = getString(12);
            const descVal = getString(13);
            const unitVal = row.getCell(14).value; // might be number/string
            const totalVal = row.getCell(15).value; // might be number/string
            const usedModelVal = getString(16);
            const respVal = getString(17);
            const stationVal = getString(18);
            const reasonVal = getString(19);
            const rootVal = getString(20);
            const counterVal = getString(21);

            // Conversions
            const dateIso = parseDate(dateVal);
            const weekInt = weekVal ? parseInt(String(weekVal)) : null;
            const qtyInt = qtyVal ? parseInt(String(qtyVal)) : 0;

            const unitFloat = parseCurrency(unitVal);
            const totalFloat = parseCurrency(totalVal);

            const userId = leaderVal || "IMPORTADO_LEGADO";
            const actualUsedModel = usedModelVal || modelVal;
            const actualStatus = statusVal || "NG";
            const actualPqc = pqcVal || "-";

            // IMPORTANT: Adjust property names to match Prisma Model EXACTLY
            // Model ScrapLog { id, userId, date, time, week, shift, leaderName, pqc, model, qty, item, status, code, description, unitValue, totalValue, usedModel, responsible, station, reason, rootCause, countermeasure, line }

            const record = {
                // id: Autogenerated by database
                userId: userId,
                date: dateIso,
                time: null,
                week: isNaN(Number(weekInt)) ? null : weekInt,
                shift: shiftVal,
                leaderName: leaderVal,
                pqc: actualPqc,
                model: modelVal,
                qty: isNaN(Number(qtyInt)) ? 0 : qtyInt,
                item: itemVal,
                status: actualStatus,
                code: codeVal,
                description: descVal,
                unitValue: unitFloat,
                totalValue: totalFloat,
                usedModel: actualUsedModel,
                responsible: respVal,
                station: stationVal,
                reason: reasonVal,
                rootCause: rootVal,
                countermeasure: counterVal,
                line: lineVal,
            };

            recordsToInsert.push(record);
            processedCount++;

            if (processedCount % 100 === 0) {
                console.log(`Processed ${processedCount} rows...`);
            }

        } catch (err) {
            console.error(`Error processing row ${rowNumber}: ${(err as Error).message}`);
        }
    });

    console.log(`Processing complete. Attempting to insert ${recordsToInsert.length} records...`);

    if (recordsToInsert.length > 0) {
        // Batch insert logic
        // SQLite has variable limit, so chunking is safer if list is huge (e.g. > 500)
        const BATCH_SIZE = 100;
        let insertedCount = 0;

        for (let i = 0; i < recordsToInsert.length; i += BATCH_SIZE) {
            const batch = recordsToInsert.slice(i, i + BATCH_SIZE);
            try {
                await prisma.scrapLog.createMany({
                    data: batch
                });
                insertedCount += batch.length;
                console.log(`Inserted batch ${i / BATCH_SIZE + 1} (${insertedCount}/${recordsToInsert.length})`);
            } catch (e) {
                console.error(`Error inserting batch starting at index ${i}: ${(e as Error).message}`);
                // Fallback: Try individual if batch fails? Optional.
            }
        }
        console.log(`\nImport Finished! Total inserted: ${insertedCount}`);
    } else {
        console.log('No records found to insert.');
    }

    await prisma.$disconnect();
}

importScrapLegacy()
    .catch(async (e) => {
        console.error('Fatal Error:', e);
        await prisma.$disconnect();
        process.exit(1);
    });
