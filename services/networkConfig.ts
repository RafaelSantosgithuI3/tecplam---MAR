
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
const API_CACHE_DB_NAME = 'tecplam-api-cache';
const API_CACHE_DB_VERSION = 1;
const API_CACHE_STORE_NAME = 'responses';

type ApiFetchOptions = RequestInit & {
    useCache?: boolean;
    cacheTTL?: number;
};

type ApiCacheRecord = {
    key: string;
    data: unknown;
    expiry: number;
};

let apiCacheDbPromise: Promise<IDBDatabase> | null = null;

const isHeavyEndpoint = (endpoint: string): boolean => {
    return HEAVY_CACHE_BLOCKLIST.some((heavyRoute) => endpoint.includes(heavyRoute));
};

const openApiCacheDb = (): Promise<IDBDatabase> => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
        return Promise.reject(new Error('IndexedDB não disponível neste ambiente.'));
    }

    if (!apiCacheDbPromise) {
        apiCacheDbPromise = new Promise((resolve, reject) => {
            const request = window.indexedDB.open(API_CACHE_DB_NAME, API_CACHE_DB_VERSION);

            request.onupgradeneeded = () => {
                const database = request.result;
                if (!database.objectStoreNames.contains(API_CACHE_STORE_NAME)) {
                    database.createObjectStore(API_CACHE_STORE_NAME, { keyPath: 'key' });
                }
            };

            request.onsuccess = () => {
                const database = request.result;
                database.onversionchange = () => {
                    database.close();
                    apiCacheDbPromise = null;
                };
                resolve(database);
            };

            request.onerror = () => {
                apiCacheDbPromise = null;
                reject(request.error || new Error('Falha ao abrir o IndexedDB do cache da API.'));
            };
        });
    }

    return apiCacheDbPromise;
};

const readCachedResponse = async (cacheKey: string): Promise<ApiCacheRecord | null> => {
    const database = await openApiCacheDb();

    return new Promise((resolve, reject) => {
        const transaction = database.transaction(API_CACHE_STORE_NAME, 'readonly');
        const request = transaction.objectStore(API_CACHE_STORE_NAME).get(cacheKey);

        request.onsuccess = () => {
            resolve((request.result as ApiCacheRecord | undefined) || null);
        };

        request.onerror = () => {
            reject(request.error || new Error('Falha ao ler cache da API no IndexedDB.'));
        };
    });
};

const writeCachedResponse = async (record: ApiCacheRecord): Promise<void> => {
    const database = await openApiCacheDb();

    await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(API_CACHE_STORE_NAME, 'readwrite');
        transaction.objectStore(API_CACHE_STORE_NAME).put(record);

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('Falha ao gravar cache da API no IndexedDB.'));
        transaction.onabort = () => reject(transaction.error || new Error('Transação abortada ao gravar cache da API.'));
    });
};

const deleteCachedResponse = async (cacheKey: string): Promise<void> => {
    const database = await openApiCacheDb();

    await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(API_CACHE_STORE_NAME, 'readwrite');
        transaction.objectStore(API_CACHE_STORE_NAME).delete(cacheKey);

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('Falha ao remover item do cache da API.'));
        transaction.onabort = () => reject(transaction.error || new Error('Transação abortada ao remover item do cache da API.'));
    });
};

export const clearApiCache = async () => {
    try {
        const database = await openApiCacheDb();
        await new Promise<void>((resolve, reject) => {
            const transaction = database.transaction(API_CACHE_STORE_NAME, 'readwrite');
            transaction.objectStore(API_CACHE_STORE_NAME).clear();

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error || new Error('Falha ao limpar cache da API.'));
            transaction.onabort = () => reject(transaction.error || new Error('Transação abortada ao limpar cache da API.'));
        });
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
    const isPublicEndpoint = ['/login', '/recover', '/register'].includes(safeEndpoint);
    const url = `${baseUrl}/api${safeEndpoint}`;
    const method = (requestOptions.method || 'GET').toUpperCase();

    // Guard: bloqueia requisições autenticadas se não há token (evita 401 em cascata)
    if (!isPublicEndpoint && !localStorage.getItem('tecplam_token')) {
        throw new Error('Sem token de autenticação.');
    }

    const isGetRequest = method === 'GET';
    const shouldUseCache = isGetRequest && useCache && !isHeavyEndpoint(safeEndpoint);
    const cacheKey = `${API_CACHE_PREFIX}${safeEndpoint}`;

    if (shouldUseCache) {
        try {
            const cached = await readCachedResponse(cacheKey);
            if (cached) {
                if (cached.expiry && Date.now() < cached.expiry) {
                    return cached.data;
                }
                await deleteCachedResponse(cacheKey);
            }
        } catch (error) {
            console.error(`Erro ao ler cache da API (${endpoint}):`, error);
        }
    }


    try {
        const authHeaders: Record<string, string> = {};
        const token = localStorage.getItem('tecplam_token');
        if (token) {
            authHeaders['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(url, {
            ...requestOptions,
            cache: 'no-store',
            headers: {
                'Content-Type': 'application/json',
                ...authHeaders,
                ...requestOptions.headers,
            },
        });

        // Sessão expirada: limpa credenciais (o App.tsx detecta via getSessionUser)
        if (response.status === 401 && !safeEndpoint.includes('/login')) {
            localStorage.removeItem('tecplam_token');
            sessionStorage.removeItem('lider_check_current_user');
            throw new Error('Sessão expirada. Faça login novamente.');
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Erro na requisição: ${response.status}`);
        }

        const result = await response.json();

        if (shouldUseCache) {
            try {
                await writeCachedResponse({
                    key: cacheKey,
                    data: result,
                    expiry: Date.now() + cacheTTL
                });
            } catch (error) {
                console.error(`Erro ao salvar cache da API (${endpoint}):`, error);
            }
        }

        if (!isGetRequest && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
            await clearApiCache();
        }

        return result;
    } catch (error) {
        console.error(`API Error (${endpoint}):`, error);
        throw error;
    }
};
