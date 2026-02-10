
import { User } from '../types';
import { apiFetch, isServerConfigured } from './networkConfig';

const CURRENT_USER_KEY = 'lider_check_current_user';
// Roles que possuem privilégios administrativos
const ADMIN_ROLES = ['SUPERVISOR', 'COORDENADOR', 'DIRETOR', 'GERENTE', 'TI'];

// --- AUTH BASIC ---

export const registerUser = async (user: User): Promise<{ success: boolean; message: string }> => {
    if (!isServerConfigured()) return { success: false, message: 'Servidor não configurado.' };

    try {
        const response = await apiFetch('/register', {
            method: 'POST',
            body: JSON.stringify(user)
        });
        return { success: true, message: response.message };
    } catch (error: any) {
        return { success: false, message: error.message || 'Erro ao cadastrar.' };
    }
};

export const loginUser = async (matricula: string, password: string): Promise<{ success: boolean; user?: User; message: string }> => {
    if (!isServerConfigured()) return { success: false, message: 'Servidor não configurado.' };

    try {
        const response = await apiFetch('/login', {
            method: 'POST',
            body: JSON.stringify({ matricula, password })
        });

        const user = response.user;
        // Alterado para sessionStorage para não persistir após fechar o navegador
        sessionStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
        return { success: true, user, message: 'Login realizado.' };

    } catch (error: any) {
        return { success: false, message: error.message || 'Erro ao fazer login.' };
    }
};

export const logoutUser = () => {
    sessionStorage.removeItem(CURRENT_USER_KEY);
};

export const getSessionUser = (): User | null => {
    const userStr = sessionStorage.getItem(CURRENT_USER_KEY);
    return userStr ? JSON.parse(userStr) : null;
};

export const updateSessionUser = (user: User) => {
    sessionStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
};

export const isAdmin = (user: User | null): boolean => {
    if (!user) return false;
    // Verifica flag explícita do banco ou roles padrão
    if (user.isAdmin === true) return true;
    return ADMIN_ROLES.includes(user.role.toUpperCase());
};

export const recoverPassword = async (matricula: string, name: string, role: string): Promise<{ success: boolean; message: string }> => {
    try {
        const response = await apiFetch('/recover', {
            method: 'POST',
            body: JSON.stringify({ matricula, name, role })
        });
        return { success: true, message: response.message };
    } catch (error: any) {
        return { success: false, message: error.message || 'Erro ao recuperar senha.' };
    }
}

// --- USER MANAGEMENT (ADMIN) ---

export const getAllUsers = async (): Promise<User[]> => {
    try {
        return await apiFetch('/users');
    } catch (e) {
        return [];
    }
}

export const deleteUser = async (matricula: string): Promise<void> => {
    try {
        await apiFetch(`/users/${matricula}`, { method: 'DELETE' });
    } catch (e) {
        console.error(e);
    }
}

export const updateUser = async (updatedUser: User, originalMatricula?: string): Promise<void> => {
    try {
        await apiFetch('/users', {
            method: 'PUT',
            body: JSON.stringify({ ...updatedUser, originalMatricula })
        });
    } catch (e) {
        console.error(e);
        throw e;
    }
}

export const seedAdmin = async () => {
    return;
}
