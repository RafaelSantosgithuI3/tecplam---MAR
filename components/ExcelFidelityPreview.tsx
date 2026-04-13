import React, { useEffect, useRef, useState, useTransition } from 'react';
import ExcelJS from 'exceljs';
import { X, FileImage, Download } from 'lucide-react';
import html2canvas from 'html2canvas';
import { formatDate } from 'date-fns';

interface ExcelFidelityPreviewProps {
    buffer: ArrayBuffer;
    onClose: () => void;
    title?: string;
}

export const ExcelFidelityPreview: React.FC<ExcelFidelityPreviewProps> = ({ buffer, onClose, title = "Visualização da Planilha" }) => {
    const [htmlTable, setHtmlTable] = useState<React.ReactNode | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isDownloadingImage, setIsDownloadingImage] = useState(false);
    const [scale, setScale] = useState(1);
    const [, startTransition] = useTransition();
    const wrapperRef = useRef<HTMLDivElement>(null);
    const tableContainerRef = useRef<HTMLDivElement>(null);

    // Referência para a div que contém a tabela inteira
    const tableRef = useRef<HTMLDivElement>(null);

    const handleDownloadJPG = async () => {
        if (!tableRef.current) return;

        setIsDownloadingImage(true);
        try {
            // html2canvas tira o print do HTML
            const canvas = await html2canvas(tableRef.current, {
                scale: 2, // Melhora a qualidade da imagem (Retina/Alta resolução)
                useCORS: true, // Permite carregar imagens geradas por URL.createObjectURL
                backgroundColor: '#ffffff', // Garante o fundo branco caso falte
                logging: false,
            });

            // Converte o canvas para JPG com 90% de qualidade
            const imgData = canvas.toDataURL('image/jpeg', 0.9);

            // Cria um link fantasma para forçar o download
            const link = document.createElement('a');
            link.download = `${title} - ${formatDate(new Date(), 'dd/MM/yy')}.jpg`;
            link.href = imgData;
            link.click();
        } catch (error) {
            console.error('Erro ao gerar imagem JPG:', error);
            alert('Não foi possível gerar a imagem JPG. Verifique o console.');
        } finally {
            setIsDownloadingImage(false);
        }
    };

    useEffect(() => {
        const processExcel = async () => {
            try {
                const wb = new ExcelJS.Workbook();
                await wb.xlsx.load(buffer);
                const ws = wb.worksheets[0];

                // 1. Processar Mesclagens (Merges)
                const merges = (ws as any)._merges || {};
                const skipCells = new Set<string>();

                Object.values(merges).forEach((merge: any) => {
                    for (let r = merge.top; r <= merge.bottom; r++) {
                        for (let c = merge.left; c <= merge.right; c++) {
                            if (r === merge.top && c === merge.left) continue;
                            skipCells.add(`${r}-${c}`);
                        }
                    }
                });

                // 2. Extrair Imagens
                const imageMap: Record<string, string> = {};
                let logoBase64: string | null = null;

                ws.getImages().forEach((img) => {
                    const pic = wb.getImage(Number(img.imageId));
                    if (pic && pic.buffer) {
                        const blob = new Blob([pic.buffer], { type: `image/${pic.extension}` });
                        const url = URL.createObjectURL(blob);

                        let r = Math.floor(img.range.tl.row) + 1;
                        let c = Math.floor(img.range.tl.col) + 1;

                        Object.values(merges).forEach((merge: any) => {
                            if (r >= merge.top && r <= merge.bottom && c >= merge.left && c <= merge.right) {
                                r = merge.top;
                                c = merge.left;
                            }
                        });
                        imageMap[`${r}-${c}`] = url;

                        // Captura a primeira imagem como logo candidata
                        if (!logoBase64) {
                            const reader = new FileReader();
                            reader.onloadend = () => { logoBase64 = reader.result as string; };
                            reader.readAsDataURL(blob);
                        }
                    }
                });

                // 2b. Extrair logo de workbook.model.media (imagens embedded que não pertencem a células)
                if (!logoBase64) {
                    try {
                        const media = (wb as any).model?.media;
                        if (Array.isArray(media) && media.length > 0) {
                            const img = media[0];
                            const bufData = img.buffer || img.data;
                            if (bufData) {
                                const ext = img.extension || img.type || 'png';
                                const blob = new Blob([bufData], { type: `image/${ext}` });
                                logoBase64 = URL.createObjectURL(blob);
                            }
                        }
                    } catch (_) { /* silencioso */ }
                }

                // 2c. Fallback: buscar logo do servidor (extração do template original)
                if (!logoBase64) {
                    try {
                        const resp = await fetch('/api/template-logo');
                        if (resp.ok) {
                            const data = await resp.json();
                            if (data.logoBase64) logoBase64 = data.logoBase64;
                        }
                    } catch (_) { /* silencioso */ }
                }

                // 2d. Fallback final: logo.png estático
                if (!logoBase64) {
                    try {
                        const resp = await fetch('/logo.png');
                        if (resp.ok) {
                            const blob = await resp.blob();
                            logoBase64 = URL.createObjectURL(blob);
                        }
                    } catch (_) { /* silencioso */ }
                }

                // 3. Tradutores de Estilo
                const getRgba = (colorObj: any, isFont = false) => {
                    if (!colorObj) return undefined;
                    if (colorObj.argb) {
                        const argb = colorObj.argb;
                        if (argb === '00000000') return 'transparent';
                        if (argb.length === 8) return `#${argb.substring(2)}`;
                        return `#${argb}`;
                    }
                    if (colorObj.theme !== undefined) {
                        const themes = ['#ffffff', '#000000', '#e7e6e6', '#1f497d', '#4f81bd', '#c0504d', '#9bbb59', '#8064a2', '#4bacc6', '#f79646'];
                        let baseColor = themes[colorObj.theme];
                        if (colorObj.theme === 0 && colorObj.tint !== undefined) {
                            if (colorObj.tint <= -0.49) return '#808080';
                            if (colorObj.tint <= -0.24) return '#d9d9d9';
                            if (colorObj.tint <= -0.14) return '#f2f2f2';
                            if (colorObj.tint <= -0.04) return '#f9f9f9';
                        }
                        return baseColor || (isFont ? '#000000' : '#ffffff');
                    }
                    return undefined;
                };

                const getBorderStyle = (borderDef: any) => {
                    if (!borderDef || !borderDef.style) return undefined;
                    const color = '#000000';
                    let thickness = 'thin';
                    if (borderDef.style === 'thick') thickness = '2px';
                    return `${thickness} solid ${color}`;
                };

                // NOVA FUNÇÃO: Busca as bordas das extremidades de uma célula mesclada
                const getMergeCompositeBorder = (rowNum: number, colNum: number, defaultBorder: any) => {
                    let compBorder = { ...defaultBorder };
                    Object.values(merges).forEach((m: any) => {
                        if (m.top === rowNum && m.left === colNum) {
                            const topCell = ws.getRow(m.top).getCell(m.left);
                            const bottomCell = ws.getRow(m.bottom).getCell(m.left);
                            const rightCell = ws.getRow(m.top).getCell(m.right);

                            if (topCell.border?.top) compBorder.top = topCell.border.top;
                            if (bottomCell.border?.bottom) compBorder.bottom = bottomCell.border.bottom;
                            if (topCell.border?.left) compBorder.left = topCell.border.left;
                            if (rightCell.border?.right) compBorder.right = rightCell.border.right;
                        }
                    });
                    return compBorder;
                };

                // 4. Otimização Estrita de Tamanho (Corta as colunas/linhas vazias infinitas)
                let maxCol = 1;
                let maxRow = 1;

                // Garante que pelo menos o espaço das mesclagens seja lido
                Object.values(merges).forEach((m: any) => {
                    if (m.right > maxCol) maxCol = m.right;
                    if (m.bottom > maxRow) maxRow = m.bottom;
                });

                // Busca apenas as células que REALMENTE têm valor preenchido ou imagem para expandir os limites
                ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
                    row.eachCell({ includeEmpty: false }, (cell, colNum) => {
                        if (cell.value !== null && cell.value !== undefined && cell.value !== '') {
                            if (colNum > maxCol) maxCol = colNum;
                            if (rowNum > maxRow) maxRow = rowNum;
                        }
                    });
                });

                // 5. Renderização
                const rowsRender: React.ReactNode[] = [];

                for (let rowNumber = 1; rowNumber <= maxRow; rowNumber++) {
                    const row = ws.getRow(rowNumber);
                    const cellsRender: React.ReactNode[] = [];
                    const rowHeight = row.height || 15;

                    for (let colNumber = 1; colNumber <= maxCol; colNumber++) {
                        if (skipCells.has(`${rowNumber}-${colNumber}`)) continue;

                        const cell = row.getCell(colNumber);
                        let rowSpan = 1;
                        let colSpan = 1;

                        Object.values(merges).forEach((merge: any) => {
                            if (merge.top === rowNumber && merge.left === colNumber) {
                                rowSpan = merge.bottom - merge.top + 1;
                                colSpan = merge.right - merge.left + 1;
                            }
                        });

                        const colWidth = ws.getColumn(colNumber).width || 10;

                        const style: React.CSSProperties = {
                            minWidth: `${colWidth * 6}px`,
                            minHeight: `${rowHeight * 1.2}px`,
                            padding: '4px',
                            paddingBottom: '6px',
                            whiteSpace: 'nowrap',
                            lineHeight: '1.5',
                            letterSpacing: '0.3px',
                            fontFamily: '"Calibri", "Arial", sans-serif',
                            fontSize: '10pt',
                            color: '#000000',
                            backgroundColor: 'transparent',
                            border: 'none',
                            verticalAlign: 'middle',
                            boxSizing: 'border-box',
                        };

                        if (cell.fill && cell.fill.type === 'pattern') {
                            const colorTarget = cell.fill.fgColor || cell.fill.bgColor;
                            const bgColor = getRgba(colorTarget, false);
                            if (bgColor && bgColor !== 'transparent') style.backgroundColor = bgColor;
                        }

                        if (cell.font) {
                            if (cell.font.size) style.fontSize = `${cell.font.size}pt`;
                            if (cell.font.bold) style.fontWeight = 'bold';
                            const fontColor = getRgba(cell.font.color, true);
                            if (fontColor && fontColor !== 'transparent') style.color = fontColor;
                        }

                        style.textAlign = 'center';
                        if (cell.alignment) {
                            if (cell.alignment.horizontal) style.textAlign = cell.alignment.horizontal as any;
                        }

                        // Aplica a nova regra de composição de bordas para Mesclagens
                        const finalBorder = (rowSpan > 1 || colSpan > 1)
                            ? getMergeCompositeBorder(rowNumber, colNumber, cell.border)
                            : cell.border;

                        if (finalBorder) {
                            if (finalBorder.top) style.borderTop = getBorderStyle(finalBorder.top);
                            if (finalBorder.bottom) style.borderBottom = getBorderStyle(finalBorder.bottom);
                            if (finalBorder.left) style.borderLeft = getBorderStyle(finalBorder.left);
                            if (finalBorder.right) style.borderRight = getBorderStyle(finalBorder.right);
                        }

                        const cellImage = imageMap[`${rowNumber}-${colNumber}`];
                        let cellText = '';
                        if (cell.type === ExcelJS.ValueType.RichText) {
                            const richTextParts = (cell.value as any)?.richText;
                            if (Array.isArray(richTextParts)) {
                                cellText = richTextParts.map((part: any) => part?.text || '').join('').trim();
                            }
                        } else if (cell.value !== null && cell.value !== undefined) {
                            cellText = cell.value.toString().trim();
                        }

                        const hasExplicitBorder = !!(finalBorder && (finalBorder.top || finalBorder.bottom || finalBorder.left || finalBorder.right));
                        const hasRealFill = style.backgroundColor !== 'transparent';
                        const hasRealContent = cellText.length > 0 || !!cellImage;
                        if (!hasExplicitBorder) {
                            if (hasRealFill || hasRealContent) {
                                style.border = 'thin solid #000000';
                            } else {
                                style.border = 'none';
                                style.backgroundColor = 'transparent';
                            }
                        }

                        cellsRender.push(
                            <td key={colNumber} colSpan={colSpan} rowSpan={rowSpan} style={style}>
                                {cellImage ? (
                                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', width: '100%' }}>
                                        <img src={cellImage} alt="Logo" style={{ maxHeight: '95%', maxWidth: '95%', objectFit: 'contain' }} />
                                    </div>
                                ) : (cellText.toUpperCase() === 'LOGO' && logoBase64) ? (
                                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', width: '100%' }}>
                                        <img src={logoBase64} alt="Logo" style={{ maxWidth: '200px', maxHeight: '95%', objectFit: 'contain' }} />
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%', padding: '4px', lineHeight: '1.5', whiteSpace: 'nowrap', boxSizing: 'border-box' }}>
                                        {cellText}
                                    </div>
                                )}
                            </td>
                        );
                    }
                    rowsRender.push(
                        <tr key={rowNumber}>
                            {cellsRender}
                        </tr>
                    );
                }

                startTransition(() => {
                    setHtmlTable(
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                            <table style={{ borderCollapse: 'collapse', backgroundColor: 'white', tableLayout: 'fixed' }}>
                                <tbody>{rowsRender}</tbody>
                            </table>
                        </div>
                    );
                });
            } catch (error) {
                console.error("Erro:", error);
                startTransition(() => {
                    setHtmlTable(<div className="p-10 text-red-500">Erro ao renderizar.</div>);
                });
            } finally {
                startTransition(() => {
                    setIsLoading(false);
                });
            }
        };

        processExcel();
    }, [buffer]);

    useEffect(() => {
        const updateScale = () => {
            if (wrapperRef.current && tableContainerRef.current && htmlTable) {
                const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
                if (!isDesktop) {
                    setScale(1);
                    return;
                }

                const availableWidth = wrapperRef.current.clientWidth - 40;
                const availableHeight = wrapperRef.current.clientHeight - 40;

                const tableWidth = tableContainerRef.current.scrollWidth;
                const tableHeight = tableContainerRef.current.scrollHeight;

                if (tableWidth === 0 || tableHeight === 0) return;

                const scaleX = availableWidth / tableWidth;
                const scaleY = availableHeight / tableHeight;

                const newScale = Math.min(scaleX, scaleY, 1);
                setScale(newScale);
            }
        };

        updateScale();
        const timeoutId = window.setTimeout(updateScale, 100);

        window.addEventListener('resize', updateScale);
        return () => {
            window.removeEventListener('resize', updateScale);
            window.clearTimeout(timeoutId);
        };
    }, [htmlTable]);

    return (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex justify-center items-center p-4 md:p-8">
            <div className="bg-slate-200 dark:bg-zinc-900 w-max max-w-[98vw] md:max-w-[90vw] h-[95vh] flex flex-col rounded-xl overflow-hidden shadow-2xl border border-slate-300 dark:border-zinc-700">
                <div className="flex justify-between items-center p-4 border-b border-slate-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-sm z-20 shrink-0">
                    <h3 className="font-bold flex items-center gap-2 text-slate-800 dark:text-zinc-200">
                        <FileImage size={18} className="text-blue-600" />
                        {title}
                    </h3>
                    <div className="flex items-center gap-3">
                        {/* NOVO BOTÃO DE DOWNLOAD JPG */}
                        <button
                            onClick={handleDownloadJPG}
                            disabled={isLoading || isDownloadingImage || !htmlTable}
                            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-md transition-colors"
                        >
                            {isDownloadingImage ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                            ) : (
                                <Download size={16} />
                            )}
                            {isDownloadingImage ? 'Gerando JPG...' : 'Baixar JPG'}
                        </button>

                        {/* Botão de Fechar */}
                        <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                            <X size={20} className="text-slate-500" />
                        </button>
                    </div>
                </div>
                <div
                    ref={wrapperRef}
                    className="flex-1 overflow-hidden p-4 md:p-8 relative flex justify-center items-center bg-slate-100 dark:bg-zinc-800"
                >
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center text-slate-500 h-full">
                            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500 mb-4"></div>
                            <p>Desenhando Planilha (Clone Visual)...</p>
                        </div>
                    ) : (
                        <div className="w-full overflow-x-auto lg:w-max lg:overflow-x-visible lg:mx-auto">
                            <div
                                ref={tableContainerRef}
                                style={{
                                    transform: `scale(${scale})`,
                                    transformOrigin: 'center center',
                                    transition: 'transform 0.15s ease-in-out'
                                }}
                                className="relative w-max lg:w-auto"
                            >
                                <div ref={tableRef} className="bg-white shadow-2xl p-6 inline-block w-max">
                                    {htmlTable}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
