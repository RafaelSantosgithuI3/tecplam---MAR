
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { User, ChecklistItem, ChecklistLog, MeetingLog, LineStopData, ChecklistData } from '../types';
import { getLogs, getLogsByWeekSyncStrict } from './storageService';
import { getAllUsers } from './authService';

const getWeekNumber = (d: Date) => {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return weekNo;
}

const loadTemplate = async (): Promise<ExcelJS.Workbook> => {
    const workbook = new ExcelJS.Workbook();
    try {
        const response = await fetch('/template_checklist.xlsx');
        if (!response.ok) throw new Error(`Template fetch status: ${response.status}`);
        const buffer = await response.arrayBuffer();
        await workbook.xlsx.load(buffer);
    } catch (e) {
        console.warn("Template não encontrado. Criando nova planilha em memória.", e);
        workbook.addWorksheet('Checklist');
    }
    return workbook;
};

const getChecklistItemsFromLog = (log: ChecklistLog | undefined, currentItems: ChecklistItem[]): ChecklistItem[] => {
    // Prioriza o snapshot salvo no log para manter histórico fiel
    if (log && log.itemsSnapshot && log.itemsSnapshot.length > 0) {
        return log.itemsSnapshot;
    }
    return currentItems;
}

// Utilitário para garantir mesclagem sem erro
const forceMerge = (sheet: ExcelJS.Worksheet, range: string) => {
    try {
        sheet.unMergeCells(range);
    } catch (e) { }
    try {
        sheet.mergeCells(range);
    } catch (e) { console.warn('Merge error', range); }
};

export const createExcelBuffer = async (
    lineName: string,
    shiftName: string,
    dateObj: Date,
    items: ChecklistItem[],
    allLogs: ChecklistLog[],
    allUsers: User[]
) => {
    console.log("Iniciando geração do Excel...");
    const workbook = await loadTemplate();
    let worksheet = workbook.worksheets[0];
    if (!worksheet) worksheet = workbook.addWorksheet('Checklist');

    // --- CONFIGURAÇÃO DE COLUNAS (Layout Fixo) ---
    worksheet.getColumn('A').width = 5;  // ID
    worksheet.getColumn('B').width = 15; // Categoria
    worksheet.getColumn('C').width = 10; // Texto
    worksheet.getColumn('D').width = 10; // Texto
    worksheet.getColumn('E').width = 10; // Texto
    worksheet.getColumn('F').width = 21; // Imagem Ref (Ajustado para 21 conforme solicitado)
    // Dias da semana
    ['G', 'H', 'I', 'J', 'K', 'L'].forEach(col => worksheet.getColumn(col).width = 8);

    // --- DADOS DA SEMANA ---
    // Busca logs filtrados rigorosamente
    const weeklyLogs = getLogsByWeekSyncStrict(allLogs, dateObj, lineName, shiftName, allUsers);

    // Mapa: '2023-10-25' => Log
    const logsByDateMap: { [dateStr: string]: ChecklistLog } = {};
    weeklyLogs.forEach(l => {
        // Garante formato YYYY-MM-DD
        const dStr = l.date.split('T')[0];
        logsByDateMap[dStr] = l;
    });

    // Calcular datas dos dias da semana (Segunda a Sábado)
    const current = new Date(dateObj);
    const day = current.getDay();
    const diff = current.getDate() - day + (day === 0 ? -6 : 1); // Ajuste para pegar Segunda
    const monday = new Date(current);
    monday.setDate(diff);

    const weekDateStrings: string[] = [];
    const weekDisplayDates: string[] = [];

    for (let i = 0; i < 6; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        // String para busca no Map
        weekDateStrings.push(d.toISOString().split('T')[0]);
        // String para exibição no cabeçalho (dd/mm)
        weekDisplayDates.push(`${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`);
    }

    // Define quais itens usar (do log mais recente ou da lista atual)
    const referenceLog = weeklyLogs.length > 0 ? weeklyLogs[weeklyLogs.length - 1] : undefined;
    const itemsToUse = getChecklistItemsFromLog(referenceLog, items);

    const weekNum = getWeekNumber(dateObj);
    const monthName = dateObj.toLocaleString('pt-BR', { month: 'long' }).toUpperCase();

    // --- ESTILOS PADRÃO ---
    const centerStyle: Partial<ExcelJS.Alignment> = { vertical: 'middle', horizontal: 'center', wrapText: true };
    const leftStyle: Partial<ExcelJS.Alignment> = { vertical: 'middle', horizontal: 'left', wrapText: true };
    const borderStyle: Partial<ExcelJS.Borders> = {
        top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
    };
    const headerFont = { bold: true, size: 10, name: 'Arial' };
    const dataFont = { size: 9, name: 'Arial' };

    // --- CABEÇALHO DO RELATÓRIO ---
    // Limpa merges antigos do cabeçalho para evitar conflito
    ['A5:E5', 'G5:H5', 'I5:L5'].forEach(range => {
        try { worksheet.unMergeCells(range); } catch (e) { }
    });

    forceMerge(worksheet, 'A5:E5');
    const cellA5 = worksheet.getCell('A5');
    cellA5.value = `MÊS: ${monthName} / ${dateObj.getFullYear()}`;
    cellA5.font = headerFont; cellA5.alignment = centerStyle; cellA5.border = borderStyle;

    const cellF5 = worksheet.getCell('F5');
    cellF5.value = `LINHA: ${lineName}`;
    cellF5.font = headerFont; cellF5.alignment = centerStyle; cellF5.border = borderStyle;

    forceMerge(worksheet, 'G5:H5');
    const cellG5 = worksheet.getCell('G5');
    cellG5.value = `TURNO: ${shiftName}`;
    cellG5.font = headerFont; cellG5.alignment = centerStyle; cellG5.border = borderStyle;

    forceMerge(worksheet, 'I5:L5');
    const cellI5 = worksheet.getCell('I5');
    cellI5.value = `WEEK: ${weekNum}`;
    cellI5.font = headerFont; cellI5.alignment = centerStyle; cellI5.border = borderStyle;

    // Cabeçalho dos Dias (Linha 6)
    const colLetters = ['G', 'H', 'I', 'J', 'K', 'L'];
    const daysOfWeek = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];

    colLetters.forEach((col, idx) => {
        const cell = worksheet.getCell(`${col}6`);
        cell.value = `${daysOfWeek[idx]}\n${weekDisplayDates[idx]}`;
        cell.alignment = centerStyle;
        cell.font = { bold: true, size: 8 };
        cell.border = borderStyle;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    });

    // --- CORPO DO CHECKLIST (Itens) ---
    const startRow = 7;

    // Itera sobre os itens
    for (let i = 0; i < itemsToUse.length; i++) {
        const item = itemsToUse[i];
        const currentRow = startRow + i;
        const row = worksheet.getRow(currentRow);

        // Define altura fixa para caber imagem
        row.height = 65;

        // Limpa merges que possam existir nessa linha (se for template reutilizado)
        try { worksheet.unMergeCells(`C${currentRow}:E${currentRow}`); } catch (e) { }

        // A: ID (Sequencial Visual)
        const cellA = worksheet.getCell(`A${currentRow}`);
        cellA.value = i + 1;
        cellA.alignment = centerStyle;
        cellA.border = borderStyle;
        cellA.font = dataFont;

        // B: Categoria
        const cellB = worksheet.getCell(`B${currentRow}`);
        cellB.value = item.category;
        cellB.alignment = centerStyle;
        cellB.border = borderStyle;
        cellB.font = { size: 8, bold: true };

        // C:E: Texto (Mesclar e escrever)
        forceMerge(worksheet, `C${currentRow}:E${currentRow}`);
        const cellC = worksheet.getCell(`C${currentRow}`);
        cellC.value = item.text;
        cellC.alignment = { ...leftStyle, wrapText: true };
        cellC.border = borderStyle;
        cellC.font = { size: 9 };

        // F: Imagem Referência
        const cellF = worksheet.getCell(`F${currentRow}`);
        cellF.value = "";
        cellF.border = borderStyle;

        // Lógica de Imagem
        if (item.imageUrl && item.imageUrl.length > 50) {
            try {
                let base64 = item.imageUrl;
                if (base64.includes('base64,')) {
                    base64 = base64.split('base64,')[1];
                }
                const imgId = workbook.addImage({ base64: base64, extension: 'png' });

                // CORREÇÃO: Posicionamento preciso usando 'oneCell' e coordenadas inteiras
                worksheet.addImage(imgId, {
                    tl: { col: 5, row: currentRow - 1 }, // Coluna F é index 5
                    br: { col: 6, row: currentRow },     // Até inicio da próxima coluna
                    editAs: 'oneCell'
                } as any);
            } catch (e) {
                console.warn(`Erro ao adicionar imagem na linha ${currentRow}`, e);
                cellF.value = "[Erro Img]";
            }
        } else if (item.evidence) {
            cellF.value = item.evidence;
            cellF.alignment = centerStyle;
            cellF.font = { size: 7, italic: true };
        }

        // G-L: Respostas (Dados dos Logs)
        weekDateStrings.forEach((dateStr, idx) => {
            if (idx >= 6) return; // Limite Sábado

            const colLetter = colLetters[idx];
            const cell = worksheet.getCell(`${colLetter}${currentRow}`);

            const log = logsByDateMap[dateStr];
            let val = undefined;

            if (log && log.data) {
                val = (log.data as ChecklistData)[item.id];
            }

            cell.alignment = centerStyle;
            cell.border = borderStyle;

            // CORREÇÃO: Fonte preta e fundo sem cor (branco)
            cell.font = { color: { argb: 'FF000000' }, bold: true }; // Preto
            cell.fill = { type: 'pattern', pattern: 'none' }; // Sem preenchimento

            if (val === 'OK') {
                cell.value = 'OK';
            } else if (val === 'NG') {
                cell.value = 'NG';
            } else if (val === 'N/A') {
                cell.value = 'N/A';
            } else {
                cell.value = '';
            }
        });
    }

    // --- RODAPÉ ---
    const lastItemRow = startRow + itemsToUse.length;
    const footerRow = lastItemRow + 1;

    worksheet.getRow(footerRow).height = 80;

    try { worksheet.unMergeCells(`A${footerRow}:F${footerRow}`); } catch (e) { }

    forceMerge(worksheet, `A${footerRow}:F${footerRow}`);
    const footerLabel = worksheet.getCell(`A${footerRow}`);
    footerLabel.value = "VISTO DO RESPONSÁVEL (Assinatura Eletrônica)";
    footerLabel.alignment = centerStyle;
    footerLabel.font = { bold: true, size: 10 };
    footerLabel.border = borderStyle;
    footerLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };

    // Preenche os nomes dos responsáveis nas colunas de dia
    weekDateStrings.forEach((dateStr, idx) => {
        if (idx >= 6) return;
        const colLetter = colLetters[idx];
        const cell = worksheet.getCell(`${colLetter}${footerRow}`);
        const log = logsByDateMap[dateStr];

        if (log) {
            cell.value = `${log.userName}\n(${log.userId})`;
        } else {
            cell.value = "";
        }

        cell.alignment = { textRotation: 90, vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.font = { size: 8, bold: true };
        cell.border = borderStyle;
    });

    console.log("Excel montado, gerando buffer...");
    return await workbook.xlsx.writeBuffer();
};

export const downloadShiftExcel = async (line: string, shift: string, dateStr: string, items: ChecklistItem[]) => {
    // dateStr vem como "2024-W10" ou data ISO
    let dateObj = new Date();

    // Tratamento robusto para pegar a data correta da semana selecionada
    if (dateStr.includes('-W')) {
        const [yearStr, weekStr] = dateStr.split('-W');
        const year = parseInt(yearStr);
        const week = parseInt(weekStr);
        // Calcula a segunda-feira daquela semana
        const simpleDate = new Date(year, 0, 1 + (week - 1) * 7);
        const day = simpleDate.getDay();
        const diff = simpleDate.getDate() - day + (day === 0 ? -6 : 1);
        dateObj = new Date(simpleDate.setDate(diff));
    } else {
        dateObj = new Date(dateStr);
    }

    const allLogs = await getLogs();
    const allUsers = await getAllUsers();

    try {
        const buffer = await createExcelBuffer(line, shift, dateObj, items, allLogs, allUsers);
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        // FORMATO: CHECKLIST_LINHA_SEMANA.XLSX
        saveAs(blob, `CHECKLIST_${line}_Week${getWeekNumber(dateObj)}.xlsx`);
    } catch (e) {
        console.error("ERRO CRÍTICO NO DOWNLOAD EXCEL:", e);
        alert(`Erro ao gerar planilha: ${e instanceof Error ? e.message : 'Erro desconhecido'}`);
    }
}

// Export individual
export const exportLogToExcel = async (log: ChecklistLog, currentItems: ChecklistItem[]) => {
    if (log.type === 'LINE_STOP') return exportLineStopToExcel(log);

    const allLogs = await getLogs();
    const allUsers = await getAllUsers();

    try {
        const buffer = await createExcelBuffer(
            log.line || 'GERAL',
            log.userRole.includes('Turno 2') ? '2' : '1',
            new Date(log.date),
            currentItems,
            allLogs,
            allUsers
        );

        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

        // FORMATO: CHECKLIST_NOME DO LIDER(SÓ O PRIMEIRO NOME)_LINHA_DATA.XLSX
        const firstName = log.userName.split(' ')[0].toUpperCase();
        const simpleDate = log.date.split('T')[0];
        const fileName = `CHECKLIST_${firstName}_${log.line}_${simpleDate}.xlsx`;

        saveAs(blob, fileName);
    } catch (e) {
        console.error("ERRO CRÍTICO NO DOWNLOAD INDIVIDUAL:", e);
        alert(`Erro ao gerar planilha individual: ${e instanceof Error ? e.message : 'Erro desconhecido'}`);
    }
}

export const exportMeetingToExcel = async (meeting: MeetingLog) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Ata');

    // Headers and Styling...
    worksheet.mergeCells('A1:H1');
    worksheet.getCell('A1').value = `ATA: ${meeting.title}`;
    worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    worksheet.getCell('A1').font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 12 };
    worksheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.mergeCells('A2:H2');
    worksheet.getCell('A2').value = `DATA: ${new Date(meeting.date).toLocaleDateString()} | HORÁRIO: ${meeting.startTime} - ${meeting.endTime}`;
    worksheet.getCell('A2').alignment = { horizontal: 'center' };

    worksheet.mergeCells('A4:H15');
    if (meeting.photoUrl) {
        const imgId = workbook.addImage({ base64: meeting.photoUrl.replace(/^data:image\/\w+;base64,/, ""), extension: 'png' });
        worksheet.addImage(imgId, { tl: { col: 0, row: 3 }, br: { col: 8, row: 15 }, editAs: 'oneCell' } as any);
    } else {
        worksheet.getCell('A4').value = "SEM FOTO";
        worksheet.getCell('A4').alignment = { horizontal: 'center', vertical: 'middle' };
    }

    worksheet.mergeCells('A16:H16');
    worksheet.getCell('A16').value = "PARTICIPANTES";
    worksheet.getCell('A16').font = { bold: true };
    worksheet.getCell('A16').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };

    let r = 17;
    const uniqueParticipants = meeting.participants.filter(p => p.trim().toLowerCase() !== meeting.createdBy.trim().toLowerCase());

    uniqueParticipants.forEach(p => {
        worksheet.mergeCells(`A${r}:H${r}`);
        worksheet.getCell(`A${r}`).value = `• ${p}`;
        r++;
    });

    worksheet.mergeCells(`A${r}:H${r}`);
    worksheet.getCell(`A${r}`).value = `• ${meeting.createdBy} (Relator)`;
    worksheet.getCell(`A${r}`).font = { bold: true, italic: true };
    r++;

    worksheet.mergeCells(`A${r}:H${r}`);
    worksheet.getCell(`A${r}`).value = "PAUTA / ASSUNTOS";
    worksheet.getCell(`A${r}`).font = { bold: true };
    worksheet.getCell(`A${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
    r++;

    worksheet.mergeCells(`A${r}:H${r + 5}`);
    worksheet.getCell(`A${r}`).value = meeting.topics;
    worksheet.getCell(`A${r}`).alignment = { vertical: 'top', wrapText: true };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const safeTitle = meeting.title.replace(/[^a-z0-9]/gi, '_').toUpperCase();
    saveAs(blob, `ATA_${safeTitle}_${meeting.date.substring(0, 10)}.xlsx`);
}

/**
 * Função reescrita com blindagem completa de dados e novo layout de assinatura (célula única mesclada).
 */
export const exportLineStopToExcel = async (log: ChecklistLog) => {
    // 1. Validação Inicial
    if (!log || !log.data) {
        throw new Error("Dados de parada inválidos ou inexistentes.");
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Parada');

    // Casting seguro
    const data = (log.data || {}) as LineStopData;

    // Definição de colunas: 10 colunas (A-J) para caber 5 blocos de assinatura duplos
    worksheet.columns = [
        { width: 12 }, { width: 12 },
        { width: 12 }, { width: 12 },
        { width: 12 }, { width: 12 },
        { width: 12 }, { width: 12 },
        { width: 12 }, { width: 12 }
    ];

    const border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } } as Partial<ExcelJS.Borders>;
    const center = { vertical: 'middle', horizontal: 'center', wrapText: true } as Partial<ExcelJS.Alignment>;

    // 2. Extração segura do Turno e Data
    const roleStr = log.userRole || '';
    let shift = 'N/A';
    // Tenta extrair turno de diferentes formatos
    if (roleStr.includes('Turno')) {
        shift = roleStr.split('Turno')[1]?.trim() || 'N/A';
    } else if (roleStr.match(/T[1-3]/)) {
        shift = roleStr.match(/T[1-3]/)?.[0] || 'N/A';
    }

    let dateStr = 'Data Inválida';
    try {
        const d = new Date(log.date);
        if (!isNaN(d.getTime())) {
            dateStr = d.toLocaleDateString();
        }
    } catch (e) { }

    // --- TÍTULO ---
    worksheet.mergeCells('A1:J1');
    const title = worksheet.getCell('A1');
    title.value = "EXPRESSO DE PARADA DE LINHA";
    title.font = { size: 16, bold: true };
    title.alignment = center;
    title.border = border;

    const addField = (range: string, label: string, val: string | undefined | null) => {
        worksheet.mergeCells(range);
        const cell = worksheet.getCell(range.split(':')[0]);
        cell.value = `${label}:\n${val || ''}`;
        cell.alignment = center;
        cell.border = border;
        cell.font = { bold: true };
    }

    // --- CABEÇALHO DADOS ---
    addField('A2:B3', 'MODELO', data.model);
    addField('C2:D3', 'DATA', dateStr);
    addField('E2:F3', 'TURNO', shift);
    // Usa nome do autor (log.userName) para o campo Líder
    const leaderName = log.userName || (log as any).user_name || 'N/A';
    addField('G2:H3', 'LÍDER/RESP', leaderName);
    addField('I2:J3', 'CLIENTE', data.client);

    const addVal = (range: string, val: string) => {
        worksheet.mergeCells(range);
        const c = worksheet.getCell(range.split(':')[0]);
        c.value = val;
        c.border = border;
        c.alignment = center;
    }

    // --- TEMPOS E DETALHES ---
    addVal('A4:B4', `INICIO: ${data.startTime || '--:--'}`);
    addVal('C4:D4', `FIM: ${data.endTime || '--:--'}`);
    addVal('E4:F4', `LINHA: ${data.line || log.line || ''}`);
    addVal('G4:H4', `FASE: ${data.phase || ''}`);
    addVal('I4:J4', `PERCA: ${data.productionLoss || '0'}`);

    worksheet.mergeCells('A6:F6');
    worksheet.getCell('A6').value = `POSTO: ${data.stationStart || '?'} ATÉ ${data.stationEnd || '?'}`;
    worksheet.getCell('A6').border = border;

    worksheet.mergeCells('G6:J6');
    worksheet.getCell('G6').value = `TOTAL PARADO: ${data.totalTime || '00:00'}`;
    worksheet.getCell('G6').font = { color: { argb: 'FFFF0000' }, bold: true };
    worksheet.getCell('G6').border = border;

    // --- MOTIVO ---
    worksheet.mergeCells('A7:J7');
    worksheet.getCell('A7').value = "MOTIVO / OCORRÊNCIA:";
    worksheet.getCell('A7').font = { bold: true };

    worksheet.mergeCells('A8:J11');
    const motivo = worksheet.getCell('A8');
    motivo.value = data.motivo || 'Sem descrição.';
    motivo.alignment = { vertical: 'top', wrapText: true };
    motivo.border = border;

    // --- SETORES ---
    const sectors = [
        { k: 'GQ', l: 'PRODUÇÃO', c: 0 }, { k: 'SMD/IAC', l: 'PRÉ-FORMA', c: 2 },
        { k: 'MANUTENÇÃO', l: 'MATERIAIS', c: 4 }, { k: 'PCP', l: 'ÁREA TÉCNICA', c: 6 },
        { k: 'SAMSUNG', l: 'EXTERNO', c: 8 }
    ];

    const respSector = (data.responsibleSector || '').toUpperCase();

    sectors.forEach((s, i) => {
        worksheet.mergeCells(12, s.c + 1, 12, s.c + 2);
        worksheet.getCell(12, s.c + 1).value = `${respSector === s.k ? '☑' : '☐'} ${s.k}`;
        worksheet.getCell(12, s.c + 1).border = border;

        worksheet.mergeCells(13, s.c + 1, 13, s.c + 2);
        worksheet.getCell(13, s.c + 1).value = `${respSector === s.l ? '☑' : '☐'} ${s.l}`;
        worksheet.getCell(13, s.c + 1).border = border;
    });

    // --- JUSTIFICATIVA ---
    worksheet.mergeCells('A15:J15');
    worksheet.getCell('A15').value = "JUSTIFICATIVAS / SOLUÇÃO DEFINITIVA:";
    worksheet.getCell('A15').font = { bold: true, underline: true };

    worksheet.mergeCells('A16:J19');
    const just = worksheet.getCell('A16');
    just.value = data.justification || 'Pendente de justificativa.';
    just.alignment = { vertical: 'top', wrapText: true };
    just.border = border;

    // --- NOVO BLOCO DE ASSINATURAS (5 ASSINATURAS LADO A LADO) ---
    // Ajuste de espaçamento
    const signRowStart = 21;

    // Títulos específicos solicitados
    const signatures = [
        'SETOR RESP.',
        'SUPERVISOR GERAL',
        'COORDENADOR',
        'PCP',
        'DIRETOR GERAL'
    ];

    let colIndex = 1; // Coluna A (index 1 no ExcelJS)

    signatures.forEach((title) => {
        // Mescla um bloco grande para cada assinatura (2 colunas x 4 linhas)
        // Ex: A21:B24
        const startR = signRowStart;
        const endR = signRowStart + 3;

        worksheet.mergeCells(startR, colIndex, endR, colIndex + 1);
        const cell = worksheet.getCell(startR, colIndex);

        // Conteúdo com quebra de linha para ficar na mesma célula
        cell.value = `${title}\n\n\n__________________________\nDATA: __/__/____`;

        // Estilização Essencial
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = border; // Borda em volta do bloco inteiro
        cell.font = { bold: true, size: 8 };

        // Avança 2 colunas para o próximo bloco
        colIndex += 2;
    });

    // 3. Geração do Arquivo com nome seguro
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    // Nome do arquivo seguro
    const dateFile = dateStr.replace(/\//g, '-');
    saveAs(blob, `Parada_${log.line || 'LINHA'}_${dateFile}.xlsx`);
}
