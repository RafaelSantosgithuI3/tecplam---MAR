
const SERVER_URL_KEY = 'lider_check_server_url';

export const saveServerUrl = (url: string) => {
    // Garante que não tenha barra no final
    const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    localStorage.setItem(SERVER_URL_KEY, cleanUrl);
};

export const getServerUrl = (): string | null => {
    return localStorage.getItem(SERVER_URL_KEY);
};

export const clearServerUrl = () => {
    localStorage.removeItem(SERVER_URL_KEY);
};

export const isServerConfigured = (): boolean => {
    return !!getServerUrl();
};

export const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
    const baseUrl = getServerUrl();
    if (!baseUrl) throw new Error("Servidor não configurado");

    const url = `${baseUrl}/api${endpoint}`;
    
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
