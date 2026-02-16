
// Ajuste na Base URL
export const BASE_URL = import.meta.env.DEV
    ? 'http://localhost:3000'
    : window.location.origin;

// Mantido para compatibilidade, mas agora retorna sempre true/BASE_URL
export const saveServerUrl = (url: string) => { console.log('Server URL is auto-configured', url); };
export const getServerUrl = (): string | null => BASE_URL;
export const clearServerUrl = () => { };
export const isServerConfigured = (): boolean => true;

export const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
    const baseUrl = BASE_URL;
    if (!baseUrl) throw new Error("Servidor não configurado");

    // Ensure endpoint starts with / if not present (safeguard)
    const safeEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${baseUrl}/api${safeEndpoint}`;


    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Erro na requisição: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`API Error (${endpoint}):`, error);
        throw error;
    }
};
