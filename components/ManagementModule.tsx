import React, { useState } from 'react';
import { Card } from './Card';
import { Button } from './Button';
import { Input } from './Input';
import { ConfigItem } from '../types';
import { addLine, deleteLine, addRole, deleteRole } from '../services/storageService';
import { Trash2, Plus, ArrowLeft } from 'lucide-react';

interface ManagementModuleProps {
    onBack: () => void;
    lines: ConfigItem[];
    roles: ConfigItem[];
    onUpdate: () => void;
}

export const ManagementModule: React.FC<ManagementModuleProps> = ({ onBack, lines, roles, onUpdate }) => {
    const [tab, setTab] = useState<'LINES' | 'ROLES'>('LINES');
    const [newItem, setNewItem] = useState('');

    const handleAdd = async () => {
        if (!newItem.trim()) return;
        if (tab === 'LINES') await addLine(newItem);
        else await addRole(newItem);
        setNewItem('');
        onUpdate();
    };

    const handleDelete = async (id: number | string) => {
        if (!confirm("Tem certeza?")) return;
        if (tab === 'LINES') await deleteLine(id);
        else await deleteRole(id);
        onUpdate();
    };

    const list = tab === 'LINES' ? lines : roles;

    return (
        <div className="space-y-6">
            <header className="flex items-center gap-4">
                <Button variant="ghost" onClick={onBack}><ArrowLeft /></Button>
                <h1 className="text-2xl font-bold text-white">Gestão {tab === 'LINES' ? 'de Linhas' : 'de Cargos'}</h1>
            </header>

            <div className="flex gap-2 bg-zinc-900 p-2 rounded-xl w-fit mb-6">
                <Button variant={tab === 'LINES' ? 'primary' : 'ghost'} onClick={() => setTab('LINES')}>Linhas</Button>
                <Button variant={tab === 'ROLES' ? 'primary' : 'ghost'} onClick={() => setTab('ROLES')}>Cargos</Button>
            </div>

            <Card className="bg-zinc-900 border-zinc-800">
                <div className="flex gap-4 mb-6">
                    <Input placeholder={`Novo item em ${tab}...`} value={newItem} onChange={e => setNewItem(e.target.value)} />
                    <Button onClick={handleAdd}><Plus className="mr-2" /> Adicionar</Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {list.map((item) => (
                        <div key={item.id} className="bg-zinc-950 p-3 rounded-lg flex justify-between items-center border border-zinc-900">
                            <span className="text-white font-medium">{item.name}</span>
                            <button onClick={() => handleDelete(item.id)} className="p-2 text-zinc-500 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
};
