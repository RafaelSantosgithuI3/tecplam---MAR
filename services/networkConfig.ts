
// Ajuste na Base URL
export const BASE_URL = import.meta.env.DEV
    ? 'http://localhost:3000'
    : window.location.origin;

// Mantido para compatibilidade, mas agora retorna sempre true/BASE_URL
export const saveServerUrl = (url: string) => { console.log('Server URL is auto-configured', url); };
export const getServerUrl = (): string | null => BASE_URL;
export const clearServerUrl = () => { };
export const isServerConfigured = (): boolean => true;

const API_CACHE_PREFIX = 'api_cache_';
const DEFAULT_CACHE_TTL = 300000;
const HEAVY_CACHE_BLOCKLIST = ['/logs', '/meetings', '/scraps', '/line-stops'];

type ApiFetchOptions = RequestInit & {
    useCache?: boolean;
    cacheTTL?: number;
};

const isHeavyEndpoint = (endpoint: string): boolean => {
    return HEAVY_CACHE_BLOCKLIST.some((heavyRoute) => endpoint.includes(heavyRoute));
};

export const clearApiCache = () => {
    try {
        for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
            const key = sessionStorage.key(index);
            if (key && key.startsWith(API_CACHE_PREFIX)) {
                sessionStorage.removeItem(key);
            }
        }
    } catch (error) {
        console.error('Erro ao limpar cache da API:', error);
    }
};

export const apiFetch = async (endpoint: string, options: ApiFetchOptions = {}) => {
    const baseUrl = BASE_URL;
    if (!baseUrl) throw new Error("Servidor não configurado");

    const {
        useCache = false,
        cacheTTL = DEFAULT_CACHE_TTL,
        ...requestOptions
    } = options;

    // Ensure endpoint starts with / if not present (safeguard)
    const safeEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${baseUrl}/api${safeEndpoint}`;
    const method = (requestOptions.method || 'GET').toUpperCase();
    const isGetRequest = method === 'GET';
    const shouldUseCache = isGetRequest && useCache && !isHeavyEndpoint(safeEndpoint);
    const cacheKey = `${API_CACHE_PREFIX}${safeEndpoint}`;

    if (shouldUseCache) {
        try {
            const cachedRaw = sessionStorage.getItem(cacheKey);
            if (cachedRaw) {
                const cached = JSON.parse(cachedRaw);
                if (cached && cached.expiry && Date.now() < cached.expiry) {
                    return cached.data;
                }
                sessionStorage.removeItem(cacheKey);
            }
        } catch (error) {
            sessionStorage.removeItem(cacheKey);
            console.error(`Erro ao ler cache da API (${endpoint}):`, error);
        }
    }


    try {
        const response = await fetch(url, {
            ...requestOptions,
            cache: 'no-store',
            headers: {
                'Content-Type': 'application/json',
                ...requestOptions.headers,
            },
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Erro na requisição: ${response.status}`);
        }

        const result = await response.json();

        if (shouldUseCache) {
            try {
                sessionStorage.setItem(cacheKey, JSON.stringify({
                    data: result,
                    expiry: Date.now() + cacheTTL
                }));
            } catch (error) {
                console.error(`Erro ao salvar cache da API (${endpoint}):`, error);
            }
        }

        if (!isGetRequest && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
            clearApiCache();
        }

        return result;
    } catch (error) {
        console.error(`API Error (${endpoint}):`, error);
        throw error;
    }
};
