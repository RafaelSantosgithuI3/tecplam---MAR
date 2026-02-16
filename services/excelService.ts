
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { User, ChecklistItem, ChecklistLog, MeetingLog, LineStopData, ChecklistData, ScrapData, PreparationLog } from '../types';
import { getLogs, getLogsByWeekSyncStrict } from './storageService';
import { getAllUsers } from './authService';
import { getMaterials } from './scrapService';

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

export const exportScrapToExcel = async (scraps: any[]) => {
    const workbook = new ExcelJS.Workbook();
    let templateBuffer: ArrayBuffer | null = null;

    try {
        const response = await fetch('/template_scrap.xlsx');
        if (response.ok) {
            templateBuffer = await response.arrayBuffer();
        }
    } catch (e) {
        console.warn("Template de Scrap não encontrado.", e);
    }

    if (templateBuffer) {
        await workbook.xlsx.load(templateBuffer);
    }

    // Group by Plant
    const groups: { [key: string]: any[] } = {};
    scraps.forEach(s => {
        const p = s.plant || 'Geral';
        if (!groups[p]) groups[p] = [];
        groups[p].push(s);
    });

    const plants = Object.keys(groups);
    if (plants.length === 0) return;

    // Helper to fill sheet
    const fillSheet = (sheet: ExcelJS.Worksheet, data: any[]) => {
        // Sort
        data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const startRow = 4;
        const borderStyle: Partial<ExcelJS.Borders> = {
            top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
        };
        const centerStyle: Partial<ExcelJS.Alignment> = { vertical: 'middle', horizontal: 'center', wrapText: true };
        const leftStyle: Partial<ExcelJS.Alignment> = { vertical: 'middle', horizontal: 'left', wrapText: true };
        const greenMedium = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6E0B4' } } as ExcelJS.Fill;
        const greenLight = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } } as ExcelJS.Fill;

        const columnWidths: { [key: string]: number } = {
            'B': 12, 'C': 8, 'D': 8, 'E': 10, 'F': 20, 'G': 15, 'H': 15, 'I': 8,
            'J': 15, 'K': 10, 'L': 12, 'M': 40, 'N': 12, 'O': 12, 'P': 15, 'Q': 15,
            'R': 12, 'S': 30, 'T': 20, 'U': 30
        };

        const updateWidth = (col: string, val: any) => {
            if (!val) return;
            const len = String(val).length;
            if (len > (columnWidths[col] || 10)) {
                columnWidths[col] = Math.min(len + 2, 60);
            }
        };

        data.forEach((scrap, index) => {
            const currentRow = startRow + index;
            const row = sheet.getRow(currentRow);
            row.height = 25;

            let dateVal = scrap.date;
            try {
                if (dateVal) {
                    const d = new Date(dateVal);
                    const userTimezoneOffset = d.getTimezoneOffset() * 60000;
                    const offsetDate = new Date(d.getTime() + userTimezoneOffset);
                    dateVal = offsetDate.toLocaleDateString('pt-BR');
                }
            } catch (e) { }

            const fillStyle = index % 2 === 0 ? greenMedium : greenLight;
            const setCell = (col: string, val: any, format?: string, alignIsLeft = false) => {
                const cell = sheet.getCell(`${col}${currentRow}`);
                cell.value = val;
                cell.border = borderStyle;
                cell.fill = fillStyle;
                cell.alignment = alignIsLeft ? leftStyle : centerStyle;
                if (format) cell.numFmt = format;
                updateWidth(col, val);
            };

            setCell('B', dateVal);
            setCell('C', scrap.week);
            setCell('D', scrap.shift);
            setCell('E', scrap.line);
            setCell('F', scrap.leaderName);
            setCell('G', scrap.pqc || '');
            setCell('H', scrap.model);
            setCell('I', scrap.qty);
            setCell('J', scrap.item);
            setCell('K', scrap.status || 'NG');
            setCell('L', scrap.code);
            setCell('M', scrap.description, undefined, true);
            setCell('N', scrap.unitValue, '"R$"#,##0.00');
            setCell('O', scrap.totalValue, '"R$"#,##0.00');
            setCell('P', scrap.usedModel || scrap.model);
            setCell('Q', scrap.responsible);
            setCell('R', scrap.station);
            setCell('S', scrap.reason, undefined, true);
            setCell('T', scrap.rootCause);
            setCell('U', scrap.countermeasure, undefined, true);
        });

        Object.keys(columnWidths).forEach(col => {
            sheet.getColumn(col).width = columnWidths[col];
        });
    };

    // If template exists, use it for the first plant, then copy for others
    // If no template, remove default sheet and add new ones
    if (!templateBuffer) {
        workbook.removeWorksheet(workbook.worksheets[0].id);
    }

    // We assume the first sheet is the template structure if loaded
    const masterSheet = workbook.worksheets[0];
    const initialName = masterSheet ? masterSheet.name : 'Scrap';

    // Process each plant
    for (let i = 0; i < plants.length; i++) {
        const plant = plants[i];
        let sheet: ExcelJS.Worksheet;

        if (i === 0 && masterSheet) {
            sheet = masterSheet;
            sheet.name = plant;
        } else {
            sheet = workbook.addWorksheet(plant);
            if (masterSheet) {
                // Copy header rows (1-3)
                for (let r = 1; r <= 3; r++) {
                    const rowSrc = masterSheet.getRow(r);
                    const rowDest = sheet.getRow(r);
                    rowDest.values = rowSrc.values;
                    // Copy basic styles manually as Deep Copy isn't native/easy
                    rowDest.height = rowSrc.height;
                    rowSrc.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                        const target = rowDest.getCell(colNumber);
                        target.style = JSON.parse(JSON.stringify(cell.style));
                        target.value = cell.value;
                    });
                }
                // Copy Merges
                // (Simplification: assuming static merges in template if any)
            }
        }
        fillSheet(sheet, groups[plant]);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const dateStr = new Date().toISOString().split('T')[0];
    saveAs(blob, `Relatorio_Scrap_Agrupado_${dateStr}.xlsx`);
};

export const exportExecutiveReport = async (scraps: ScrapData[], fileNamePrefix: string = 'Relatorio_Detalhado_SCRAP-IQC') => {
    const workbook = new ExcelJS.Workbook();

    // --------------------------------------------------------------------------------
    // 1. DATA PROCESSING
    // --------------------------------------------------------------------------------
    const PLANTS = ['P81L', 'P81M', 'P81N'];
    const CATEGORIES_PRIORITY = ['CAMERA', 'FRONT', 'REAR', 'OCTA', 'BATERIA RMA', 'BATERIA SCRAP'];

    // Fetch materials for Plant lookup if missing in Scrap
    const materials = await getMaterials();
    const materialMap: Record<string, string> = {};
    materials.forEach(m => {
        if (m.code) materialMap[m.code] = m.plant;
    });

    // Structure: Plant -> Category -> { qty, val }
    const plantData: Record<string, Record<string, { qty: number, val: number }>> = {};
    const globalData: Record<string, { qty: number, val: number }> = {};
    const modelStats: Record<string, { qty: number, val: number }> = {};

    PLANTS.forEach(p => plantData[p] = {});

    scraps.forEach(s => {
        // Categorization Rules
        const itemUpper = (s.item || '').toUpperCase();
        let category = 'MIUDEZAS';

        if (itemUpper.includes('CAMERA')) {
            category = 'CAMERA';
        } else {
            const found = CATEGORIES_PRIORITY.find(c => itemUpper.includes(c));
            if (found) category = found;
        }

        // Determine Plant: Use scrap record first, then fallback to material lookup matches code
        let plant = s.plant;
        if (!plant && s.code) {
            plant = materialMap[s.code];
        }
        if (!plant) plant = 'ND';
        plant = plant.toUpperCase().trim();

        const safePlant = (PLANTS.includes(plant) || plant === 'ND') ? plant : 'OUTROS';
        if (!plantData[safePlant]) plantData[safePlant] = {};

        if (!plantData[safePlant][category]) plantData[safePlant][category] = { qty: 0, val: 0 };
        if (!globalData[category]) globalData[category] = { qty: 0, val: 0 };

        // Model Stats
        const model = s.model || 'Unknown';
        if (!modelStats[model]) modelStats[model] = { qty: 0, val: 0 };

        const qty = Number(s.qty || 0);
        const val = Number(s.totalValue || 0);

        plantData[safePlant][category].qty += qty;
        plantData[safePlant][category].val += val;

        globalData[category].qty += qty;
        globalData[category].val += val;

        modelStats[model].qty += qty;
        modelStats[model].val += val;
    });

    // --------------------------------------------------------------------------------
    // 2. STYLES
    // --------------------------------------------------------------------------------
    const headerStyle: Partial<ExcelJS.Style> = {
        font: { bold: true, color: { argb: 'FFFFFFFF' } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }, // Dark Blue
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
    };

    const subtotalStyle: Partial<ExcelJS.Style> = {
        font: { bold: true },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }, // Light Gray
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
    };

    // Helper to format cells ensuring strictly one formatting application per cell
    const formatCell = (cell: ExcelJS.Cell, value: any, numFmt: string, style?: Partial<ExcelJS.Style>) => {
        // Set value
        cell.value = value;
        // Set Number format immediately
        if (numFmt) {
            cell.numFmt = numFmt;
        }

        // Apply Styles
        if (style) {
            cell.font = style.font || {};
            cell.fill = style.fill || { type: 'pattern', pattern: 'none' };
            cell.alignment = style.alignment || { horizontal: 'center', vertical: 'middle' };
            cell.border = style.border || {};
        } else {
            // Default Style if none provided
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        }
    };

    // --------------------------------------------------------------------------------
    // 3. SHEET 1: Resumo por Planta
    // --------------------------------------------------------------------------------
    const sheet1 = workbook.addWorksheet("Resumo por Planta");

    // Set Columns
    sheet1.columns = [
        { header: 'Categoria', key: 'cat', width: 30 },
        { header: 'Qtd', key: 'qty', width: 15 },
        { header: 'Valor Total (R$)', key: 'val', width: 25 },
        { header: '% (Share)', key: 'pct', width: 15 },
    ];

    let currentRow = 1;

    const plantsToSort = Object.keys(plantData).sort();

    plantsToSort.forEach(plant => {
        const cats = plantData[plant];
        const catKeys = Object.keys(cats);
        if (catKeys.length === 0) return;

        // Calculate Plant Total
        const plantTotalVal = Object.values(cats).reduce((acc, curr) => acc + curr.val, 0);
        const plantTotalQty = Object.values(cats).reduce((acc, curr) => acc + curr.qty, 0);

        // Plant Header
        sheet1.mergeCells(`A${currentRow}:D${currentRow}`);
        const titleCell = sheet1.getCell(`A${currentRow}`);
        titleCell.value = `PLANTA: ${plant}`;
        titleCell.style = headerStyle;
        titleCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        currentRow++;

        // Column Headers
        const headers = ['Categoria', 'Qtd', 'Valor Total (R$)', '% (Share da Planta)'];
        for (let i = 0; i < 4; i++) {
            const cell = sheet1.getCell(currentRow, i + 1);
            cell.value = headers[i];
            cell.style = headerStyle;
        }
        currentRow++;

        // Sort Categories by Value Desc
        catKeys.sort((a, b) => cats[b].val - cats[a].val);

        catKeys.forEach(cat => {
            const item = cats[cat];
            const pct = plantTotalVal > 0 ? item.val / plantTotalVal : 0;

            const row = sheet1.getRow(currentRow);

            // 1. Categoria
            formatCell(row.getCell(1), cat, '@');

            // 2. Qtd (Strict Integer)
            formatCell(row.getCell(2), Math.trunc(Number(item.qty)), '0');

            // 3. Val (Strict Currency)
            formatCell(row.getCell(3), Number(item.val), '"R$ "#,##0.00');

            // 4. Share (Strict %)
            formatCell(row.getCell(4), Number(pct), '0.00%');

            currentRow++;
        });

        // Subtotal Row
        const subRow = sheet1.getRow(currentRow);

        formatCell(subRow.getCell(1), `Subtotal ${plant}`, '', subtotalStyle);
        formatCell(subRow.getCell(2), Math.trunc(Number(plantTotalQty)), '0', subtotalStyle);
        formatCell(subRow.getCell(3), Number(plantTotalVal), '"R$ "#,##0.00', subtotalStyle);
        formatCell(subRow.getCell(4), 1, '0.00%', subtotalStyle);

        currentRow += 2; // Spacer
    });


    // --------------------------------------------------------------------------------
    // 4. SHEET 2: Resumo Geral
    // --------------------------------------------------------------------------------
    const sheet2 = workbook.addWorksheet("Resumo Geral");
    sheet2.columns = [
        { header: 'Categoria', key: 'cat', width: 30 },
        { header: 'Qtd Total', key: 'qty', width: 15 },
        { header: 'Valor Total (R$)', key: 'val', width: 25 },
        { header: '% (Share Global)', key: 'pct', width: 15 },
    ];

    currentRow = 1;

    // --- TABLE 1: CATEGORIES ---

    // Global Header
    const headers2 = ['Categoria', 'Qtd Total', 'Valor Total (R$)', '% (Share Global)'];
    for (let i = 0; i < 4; i++) {
        const cell = sheet2.getCell(currentRow, i + 1);
        cell.value = headers2[i];
        cell.style = headerStyle;
    }
    currentRow++;

    const globalCats = Object.keys(globalData);
    const globalTotalVal = Object.values(globalData).reduce((acc, curr) => acc + curr.val, 0);
    const globalTotalQty = Object.values(globalData).reduce((acc, curr) => acc + curr.qty, 0);

    // Sort by Value Desc
    globalCats.sort((a, b) => globalData[b].val - globalData[a].val);

    globalCats.forEach(cat => {
        const item = globalData[cat];
        const pct = globalTotalVal > 0 ? item.val / globalTotalVal : 0;

        const row = sheet2.getRow(currentRow);

        formatCell(row.getCell(1), cat, '@');
        formatCell(row.getCell(2), Math.trunc(Number(item.qty)), '0');
        formatCell(row.getCell(3), Number(item.val), '"R$ "#,##0.00');
        formatCell(row.getCell(4), Number(pct), '0.00%');

        currentRow++;
    });

    // Grand Total Row
    const grandRow = sheet2.getRow(currentRow);
    // TOTAL GERAL with custom styling
    const totalStyle: Partial<ExcelJS.Style> = {
        font: { bold: true, color: { argb: 'FFFFFFFF' } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
    };

    formatCell(grandRow.getCell(1), "TOTAL GERAL", '', totalStyle);
    formatCell(grandRow.getCell(2), Math.trunc(Number(globalTotalQty)), '0', totalStyle);
    formatCell(grandRow.getCell(3), Number(globalTotalVal), '"R$ "#,##0.00', totalStyle);
    formatCell(grandRow.getCell(4), 1, '0.00%', totalStyle);

    currentRow += 3; // Space before next table

    // --- TABLE 2: SHARE POR MODELO ---

    // Header
    const headersModel = ['Modelo', 'Qtd Total', 'Valor Total (R$)', '% do Valor Total'];
    for (let i = 0; i < 4; i++) {
        const cell = sheet2.getCell(currentRow, i + 1);
        cell.value = headersModel[i];
        cell.style = headerStyle;
    }
    currentRow++;

    // Process Models
    const modelKeys = Object.keys(modelStats);
    // Sort by Value Desc
    modelKeys.sort((a, b) => modelStats[b].val - modelStats[a].val);

    modelKeys.forEach(model => {
        const item = modelStats[model];
        const pct = globalTotalVal > 0 ? item.val / globalTotalVal : 0;

        const row = sheet2.getRow(currentRow);

        formatCell(row.getCell(1), model, '@');
        formatCell(row.getCell(2), Math.trunc(Number(item.qty)), '0');
        formatCell(row.getCell(3), Number(item.val), '"R$ "#,##0.00');
        formatCell(row.getCell(4), Number(pct), '0.00%');

        currentRow++;
    });

    // --- SHEET 3: DADOS BRUTOS ---
    const sheet3 = workbook.addWorksheet("Dados Brutos");
    sheet3.columns = [
        { header: 'Data', key: 'date', width: 12 },
        { header: 'Nota Fiscal', key: 'nf', width: 15 },
        { header: 'Enviado Por', key: 'sentBy', width: 20 },
        { header: 'Planta', key: 'plant', width: 10 },
        { header: 'Líder', key: 'leader', width: 20 },
        { header: 'Turno', key: 'shift', width: 8 },
        { header: 'Linha', key: 'line', width: 10 },
        { header: 'Modelo', key: 'model', width: 15 },
        { header: 'Código', key: 'code', width: 12 },
        { header: 'Descrição', key: 'desc', width: 30 },
        { header: 'Item', key: 'item', width: 20 },
        { header: 'Qtd', key: 'qty', width: 10 },
        { header: 'Valor Un.', key: 'unitVal', width: 15 },
        { header: 'Valor Total', key: 'totalVal', width: 15 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Responsável', key: 'resp', width: 20 },
        { header: 'Motivo', key: 'reason', width: 30 },
        { header: 'Contra Medida', key: 'cm', width: 30 },
    ];

    // Header Style for Raw Data
    const rawHeaderRow = sheet3.getRow(1);
    rawHeaderRow.eachCell((cell) => {
        cell.style = headerStyle;
    });

    scraps.forEach((s, idx) => {
        // Format Date
        let dateStr = s.date;
        try {
            if (dateStr) {
                const d = new Date(dateStr);
                const userTimezoneOffset = d.getTimezoneOffset() * 60000;
                const offsetDate = new Date(d.getTime() + userTimezoneOffset);
                dateStr = offsetDate.toLocaleDateString('pt-BR');
            }
        } catch (e) { }

        // ADD ROW with placeholder values we will overwrite immediately
        const rawRow = sheet3.addRow([
            dateStr,
            s.nfNumber || '-',
            s.sentBy || (s.userId ? s.userId : '-'),
            s.plant || '-',
            s.leaderName,
            s.shift,
            s.line,
            s.model,
            s.code,
            s.description,
            s.item,
            // Values placeholders
            0, 0, 0,
            s.status,
            s.responsible,
            s.reason,
            s.countermeasure
        ]);

        // STRICT CELL FORMATTING FOR DATA VALUES

        // Qty (Col 12)
        formatCell(rawRow.getCell(12), Math.trunc(Number(s.qty || 0)), '0');

        // Unit Val (Col 13)
        formatCell(rawRow.getCell(13), Number(s.unitValue || 0), '"R$ "#,##0.00');

        // Total Val (Col 14)
        formatCell(rawRow.getCell(14), Number(s.totalValue || 0), '"R$ "#,##0.00');
    });

    // Generate Buffer
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const dateStr = new Date().toISOString().split('T')[0];
    saveAs(blob, `${fileNamePrefix}_${dateStr}.xlsx`);
};

export const exportInvoiceReport = async (scraps: ScrapData[], nfNumber: string) => {
    await exportExecutiveReport(scraps, `Relatorio_NF_${nfNumber}`);
};

// ... existing exports ...

export const downloadPreparationExcel = async (logs: PreparationLog[], filters: { date: string, shift: string }) => {
    const workbook = new ExcelJS.Workbook();
    try {
        const response = await fetch('/template_preparacao.xlsx');
        if (response.ok) {
            const buffer = await response.arrayBuffer();
            await workbook.xlsx.load(buffer);
        } else {
            console.warn("Template de preparação não encontrado, criando novo.");
            throw new Error("Template Missing");
        }
    } catch (e) {
        // Create basic structure if template fails
        const sheet = workbook.addWorksheet('Preparacao');
        // Basic fallback headers would go here if needed, but assuming template exists.
        alert("Erro: Template 'template_preparacao.xlsx' não encontrado na pasta public.");
        return;
    }

    const sheet = workbook.worksheets[0];

    // Filter Logs
    const shift1 = logs.filter(l => (l.shift.includes('1') || l.shift.toUpperCase().includes('TURNO 1')));
    const shift2 = logs.filter(l => (l.shift.includes('2') || l.shift.toUpperCase().includes('TURNO 2')));

    let currentRow = 8;

    // Style Helpers
    const borderStyle: Partial<ExcelJS.Borders> = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    const centerStyle: Partial<ExcelJS.Alignment> = { vertical: 'middle', horizontal: 'center', wrapText: true };

    const writeLog = (rowIdx: number, l: PreparationLog) => {
        const row = sheet.getRow(rowIdx);

        try { sheet.unMergeCells(`B${rowIdx}:D${rowIdx}`); } catch (e) { }
        sheet.mergeCells(`B${rowIdx}:D${rowIdx}`);

        // Helper to safely get number or 0
        const getVal = (v: any) => (v === null || v === undefined || v === '') ? 0 : v;

        row.getCell('B').value = l.line;
        row.getCell('E').value = l.model;
        row.getCell('F').value = l.sku;
        row.getCell('G').value = getVal(l.plate);
        row.getCell('H').value = getVal(l.rear);
        row.getCell('I').value = getVal(l.btFt);
        row.getCell('J').value = getVal(l.pba);
        row.getCell('K').value = getVal(l.currentRfCal);
        row.getCell('L').value = getVal(l.input);
        row.getCell('M').value = getVal(l.preKey);
        row.getCell('N').value = getVal(l.lcia);
        row.getCell('O').value = getVal(l.audio);
        row.getCell('P').value = getVal(l.radiation);
        row.getCell('Q').value = getVal(l.imei);
        row.getCell('R').value = getVal(l.vct);
        row.getCell('S').value = getVal(l.revision);
        row.getCell('T').value = getVal(l.desmonte);
        row.getCell('U').value = getVal(l.oven);
        row.getCell('V').value = getVal(l.repair);

        row.eachCell((cell, colNumber) => {
            if (colNumber >= 2 && colNumber <= 22) { // B to V
                cell.border = borderStyle;
                cell.alignment = centerStyle;
                cell.font = { name: 'Arial', size: 9 };
            }
        });
    };

    const copyRowStyleAndValue = (srcRowIdx: number, targetRowIdx: number) => {
        const srcRow = sheet.getRow(srcRowIdx);
        const targetRow = sheet.getRow(targetRowIdx);

        targetRow.height = srcRow.height;

        // Iterate B to V (Col 2 to 22)
        for (let col = 2; col <= 22; col++) {
            const srcCell = srcRow.getCell(col);
            const targetCell = targetRow.getCell(col);

            targetCell.value = srcCell.value;
            targetCell.style = srcCell.style;

            // Merges
            const model = srcCell.model as any; // Access internal model to check merge
            if (srcCell.isMerged && srcCell.address === srcCell.master.address) {
                // If it behaves like a master, try to merge target similarly? 
                // ExcelJS doesn't easily expose merge dimensions from cell. 
                // We will manually replicate known merges for headers:
                // Row 6: B6:D6 (1st Shift) -> We will set value manually later for "2nd Shift" text
            }
        }
    };

    // Logic: 1st Shift OR 2nd Shift Main Header
    // If Filter is specifically '2', we just use the main header as 2nd Turno
    if (filters.shift === '2' || (shift1.length === 0 && shift2.length > 0 && filters.shift !== '1')) {
        // SCENARIO: Only 2nd Shift (or requested 2, or Is All but only 2 exists)
        const row6 = sheet.getRow(6);
        const cellB6 = row6.getCell(2);
        cellB6.value = "2º TURNO";

        shift2.forEach((l, idx) => {
            writeLog(currentRow + idx, l);
        });
        currentRow += shift2.length;
    } else {
        // SCENARIO: 1st Shift (or ALL with 1st Shift data)
        const row6 = sheet.getRow(6);
        const cellB6 = row6.getCell(2);
        cellB6.value = "1º TURNO";

        if (shift1.length > 0) {
            shift1.forEach((l, idx) => {
                writeLog(currentRow + idx, l);
            });
            currentRow += shift1.length;
        }

        // SCENARIO: Append 2nd Shift (If ALL and we have data for both or just appending)
        if (filters.shift === 'ALL' && shift2.length > 0) {
            currentRow += 2; // Gap

            const headerRowIdx = currentRow;
            const subHeaderRowIdx = currentRow + 1;

            // Copy Headers (Rows 6 and 7)
            copyRowStyleAndValue(6, headerRowIdx);

            // 1. Update Title
            sheet.getRow(headerRowIdx).getCell(2).value = "2º TURNO";

            // 2. Fix Merges for Header Row (Row 6 copy)
            try {
                sheet.unMergeCells(`B${headerRowIdx}:D${headerRowIdx}`); // Safety unmerge
                sheet.mergeCells(`B${headerRowIdx}:D${headerRowIdx}`);   // Title
            } catch (e) { }

            try {
                sheet.unMergeCells(`T${headerRowIdx}:V${headerRowIdx}`); // Safety unmerge
                sheet.mergeCells(`T${headerRowIdx}:V${headerRowIdx}`);   // Defeitos Group
            } catch (e) { }

            copyRowStyleAndValue(7, subHeaderRowIdx);

            // 3. Fix Merges for SubHeader Row (Row 7 copy)
            // "LINHA" usually spans B:D
            try {
                sheet.unMergeCells(`B${subHeaderRowIdx}:D${subHeaderRowIdx}`);
                sheet.mergeCells(`B${subHeaderRowIdx}:D${subHeaderRowIdx}`);
            } catch (e) { }

            currentRow += 2; // Move past new headers

            shift2.forEach((l, idx) => {
                writeLog(currentRow + idx, l);
            });
        }
    }


    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `Relatorio_Preparacao_${filters.date}.xlsx`);
}
