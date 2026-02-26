import React, { useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X } from 'lucide-react';

interface QRStreamReaderProps {
    onScanSuccess: (decodedText: string) => void;
    onClose: () => void;
}

export const QRStreamReader: React.FC<QRStreamReaderProps> = ({ onScanSuccess, onClose }) => {
    const scannerRef = useRef<Html5Qrcode | null>(null);

    useEffect(() => {
        scannerRef.current = new Html5Qrcode("qr-reader");

        const startScanner = (cameraIdOrConfig: string | { facingMode: string }) => {
            scannerRef.current?.start(
                cameraIdOrConfig,
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 }
                },
                (decodedText) => {
                    if (scannerRef.current) {
                        scannerRef.current.stop().then(() => {
                            scannerRef.current?.clear();
                            onScanSuccess(decodedText);
                        }).catch(err => {
                            console.error("Falha ao parar scanner após sucesso:", err);
                            onScanSuccess(decodedText);
                        });
                    } else {
                        onScanSuccess(decodedText);
                    }
                },
                (errorMessage) => {
                    // ignoramos erros de não leitura frame a frame
                }
            ).catch((err) => {
                console.error("Falha ao iniciar o scanner:", err);
            });
        };

        Html5Qrcode.getCameras().then(devices => {
            if (devices && devices.length > 0) {
                // Filtra para encontrar todas as câmeras traseiras
                const backCameras = devices.filter(device => {
                    const label = device.label.toLowerCase();
                    return label.includes('back') || label.includes('traseira') || label.includes('environment');
                });

                if (backCameras.length > 0) {
                    // Pega a ÚLTIMA câmera da lista filtrada (como a Standard/Wide normal fica pro final da API em Android)
                    const targetCamera = backCameras[backCameras.length - 1];
                    startScanner(targetCamera.id);
                } else {
                    // Fallback para o primeiro dispositivo disponível
                    startScanner({ facingMode: "environment" });
                }
            } else {
                // Sem dispositivos encontrados, mas tenta o default
                startScanner({ facingMode: "environment" });
            }
        }).catch(err => {
            console.warn("Falha ao buscar cameras, usando fallback de environment:", err);
            startScanner({ facingMode: "environment" });
        });

        return () => {
            if (scannerRef.current && scannerRef.current.isScanning) {
                scannerRef.current.stop().then(() => {
                    scannerRef.current?.clear();
                }).catch(err => {
                    console.error("Falha ao parar scanner no unmount:", err);
                });
            } else if (scannerRef.current) {
                scannerRef.current.clear();
            }
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="fixed inset-0 z-[60] bg-black/90 flex flex-col items-center justify-center p-4 backdrop-blur-sm">
            <button
                onClick={() => {
                    if (scannerRef.current && scannerRef.current.isScanning) {
                        scannerRef.current.stop().then(() => {
                            scannerRef.current?.clear();
                            onClose();
                        });
                    } else {
                        if (scannerRef.current) scannerRef.current.clear();
                        onClose();
                    }
                }}
                className="absolute top-6 right-6 text-white p-2 bg-white/10 rounded-full hover:bg-red-500 transition-colors"
            >
                <X size={28} />
            </button>
            <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-xl overflow-hidden p-2">
                <div id="qr-reader" className="w-full"></div>
            </div>
            <p className="mt-8 text-white font-medium text-center px-4 max-w-sm">
                Aponte a câmera para o QR Code da etiqueta.
            </p>
        </div>
    );
};
