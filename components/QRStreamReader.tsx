import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode, CameraDevice } from 'html5-qrcode';
import { X } from 'lucide-react';

interface QRStreamReaderProps {
    onScanSuccess: (decodedText: string) => void;
    onClose: () => void;
}

export const QRStreamReader: React.FC<QRStreamReaderProps> = ({ onScanSuccess, onClose }) => {
    const isTransitioning = useRef<boolean>(false);
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const [cameras, setCameras] = useState<CameraDevice[]>([]);
    const [selectedCameraId, setSelectedCameraId] = useState<string>('');

    // Busca e Popula Câmeras Iniciais
    useEffect(() => {
        const initCameras = async () => {
            try {
                // Força permissão e solta os tracks para expor os labels reais no Android
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                stream.getTracks().forEach(track => track.stop());

                const devices = await Html5Qrcode.getCameras();
                if (devices && devices.length > 0) {
                    setCameras(devices);

                    const savedId = localStorage.getItem('preferredCameraId');
                    const savedDeviceExists = devices.find(d => d.id === savedId);

                    if (savedId && savedDeviceExists) {
                        setSelectedCameraId(savedId);
                    } else {
                        // Sem save prévio, fallback para a última câmera da lista (geralmente a traseira)
                        const fallbackId = devices[devices.length - 1].id;
                        setSelectedCameraId(fallbackId);
                        localStorage.setItem('preferredCameraId', fallbackId);
                    }
                }
            } catch (err) {
                console.error("Falha ao levantar câmeras na inicialização:", err);
            }
        };

        if (cameras.length === 0) {
            initCameras();
        }
    }, [cameras.length]);

    // O "Cold Start": Iniciar/Trocar Leitor com segurança contra Hardware Lock
    useEffect(() => {
        if (!selectedCameraId) return;

        if (!scannerRef.current) {
            scannerRef.current = new Html5Qrcode("qr-reader");
        }

        const startScannerSequence = async () => {
            if (isTransitioning.current) return;
            isTransitioning.current = true;

            const onSuccessCallback = (decodedText: string) => {
                if (scannerRef.current && scannerRef.current.isScanning) {
                    scannerRef.current.stop().then(() => {
                        scannerRef.current?.clear();
                        onScanSuccess(decodedText);
                    }).catch(err => {
                        console.error("Falha ao parar após leitura:", err);
                        onScanSuccess(decodedText);
                    });
                }
            };

            try {
                // Etapa 1: Destruição Segura da Lente Atual
                if (scannerRef.current.isScanning) {
                    await scannerRef.current.stop();
                    scannerRef.current.clear();
                }

                // Etapa 2: O Atraso de Hardware (Cold Start Reforçado para 500ms)
                await new Promise(resolve => setTimeout(resolve, 500));

                // Etapa 3: Kill Switch e Inicialização
                await navigator.mediaDevices.getUserMedia({ video: true }).then(stream => stream.getTracks().forEach(track => track.stop())).catch(() => { });

                await scannerRef.current.start(
                    { deviceId: { exact: selectedCameraId } },
                    {
                        fps: 15,
                        qrbox: { width: 150, height: 150 },
                        disableFlip: false
                    },
                    onSuccessCallback,
                    () => { } // Ignora erros por frames não lidos (fundo vazio, etc)
                );

            } catch (err: any) {
                alert("Erro ao abrir Câmera: " + (err.message || err));
                console.error("Erro ao dar start seguro no hardware:", err);
            } finally {
                isTransitioning.current = false;
            }
        };

        startScannerSequence();

        return () => {
            // Cleanup nativo do useEffect no unmount
            if (scannerRef.current && scannerRef.current.isScanning) {
                // Evita race conditions verificando o state interno
                scannerRef.current.stop().then(() => {
                    scannerRef.current?.clear();
                }).catch(() => {
                    scannerRef.current?.clear();
                });
            } else if (scannerRef.current) {
                scannerRef.current.clear();
            }
        };
    }, [selectedCameraId, onScanSuccess]);

    const handleCameraChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newId = e.target.value;
        setSelectedCameraId(newId);
        localStorage.setItem('preferredCameraId', newId);
    };

    return (
        <div className="fixed inset-0 z-[60] bg-black/90 flex flex-col items-center justify-center p-4 backdrop-blur-sm">
            <button
                onClick={onClose}
                className="absolute top-6 right-6 text-white p-2 bg-white/10 rounded-full hover:bg-red-500 transition-colors z-[100]"
            >
                <X size={28} />
            </button>

            <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-xl overflow-hidden p-2 flex flex-col gap-4">
                {cameras.length > 0 && (
                    <div className="px-2 pt-2">
                        <label className="block text-xs font-medium text-slate-500 dark:text-zinc-400 mb-1.5 uppercase">
                            Seletor de Lente Ativa
                        </label>
                        <select
                            className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-600 text-slate-900 dark:text-zinc-100"
                            value={selectedCameraId}
                            onChange={handleCameraChange}
                        >
                            {cameras.map((cam, idx) => (
                                <option key={cam.id} value={cam.id}>
                                    {cam.label || `Câmera ${idx + 1}`}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                <div id="qr-reader" className="w-full min-h-[300px] bg-black rounded overflow-hidden"></div>
            </div>

            <p className="mt-8 text-white font-medium text-center px-4 max-w-sm">
                Aponte a câmera para o QR Code da etiqueta.
            </p>
        </div>
    );
};
