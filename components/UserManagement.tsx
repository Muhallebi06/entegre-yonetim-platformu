import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useData, useUI, useAuth, Icon } from '../App';
import { AppUser, UserRole } from '../types';

const UserFormModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    user: AppUser | null;
}> = ({ isOpen, onClose, user }) => {
    const { dataStore, pushData } = useData();
    const { showToast } = useUI();
    const { user: currentUser } = useAuth();
    const [formData, setFormData] = useState<{ username: string; pass: string; role: UserRole }>({ username: '', pass: '', role: 'user' });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const dialogRef = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        if (user) {
            setFormData({ username: user.username, pass: '', role: user.role });
        } else {
            setFormData({ username: '', pass: '', role: 'user' });
        }
    }, [user, isOpen]);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (isOpen && !dialog?.open) dialog?.showModal();
        else if (!isOpen && dialog?.open) dialog?.close();
    }, [isOpen]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const username = formData.username.trim().toLowerCase();
        if (!username) {
            showToast("Kullanıcı adı zorunludur.", "error");
            return;
        }

        if (!user && !formData.pass) {
            showToast("Yeni kullanıcı için şifre zorunludur.", "error");
            return;
        }
        
        const allUsers = dataStore.users || [];
        const isDuplicate = allUsers.some(u => u.username.toLowerCase() === username && u.id !== user?.id);
        if (isDuplicate) {
            showToast("Bu kullanıcı adı zaten mevcut.", "error");
            return;
        }

        setIsSubmitting(true);
        try {
            if (user) { // Editing
                await pushData('users', (prevUsers: AppUser[] = []) =>
                    prevUsers.map(u => {
                        if (u.id === user.id) {
                            return {
                                ...u,
                                username: username,
                                role: formData.role,
                                pass: formData.pass ? btoa(formData.pass) : u.pass // Update pass only if provided
                            };
                        }
                        return u;
                    })
                );
                showToast("Kullanıcı güncellendi.", "success");
            } else { // Adding
                const newUser: AppUser = {
                    id: crypto.randomUUID(),
                    username: username,
                    pass: btoa(formData.pass),
                    role: formData.role,
                };
                await pushData('users', (prevUsers: AppUser[] = []) => [...prevUsers, newUser]);
                showToast("Kullanıcı eklendi.", "success");
            }
            onClose();
        } catch (error) {
            console.error("Failed to save user:", error);
            showToast("Kullanıcı kaydedilemedi.", "error");
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const inputClass = "w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:ring-orange-500 focus:border-orange-500";
    const labelClass = "text-sm text-slate-600 dark:text-slate-300";
    const isEditingSelf = currentUser?.username === user?.username;

    return (
        <dialog ref={dialogRef} onClose={onClose} className="rounded-2xl p-0 w-[96vw] max-w-lg bg-white dark:bg-slate-800">
            {isOpen && (
                <form onSubmit={handleSubmit} className="p-4 md:p-6" noValidate>
                    <h3 className="text-lg font-semibold mb-4 text-slate-800 dark:text-slate-100">{user ? 'Kullanıcı Düzenle' : 'Yeni Kullanıcı Ekle'}</h3>
                    <div className="space-y-4">
                        <div>
                            <label className={labelClass}>Kullanıcı Adı</label>
                            <input name="username" type="text" value={formData.username} onChange={handleChange} required className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Şifre</label>
                            <input name="pass" type="password" value={formData.pass} onChange={handleChange} placeholder={user ? 'Değiştirmek için yeni şifre girin' : ''} className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Rol</label>
                            <select name="role" value={formData.role} onChange={handleChange} required className={inputClass} disabled={isEditingSelf}>
                                <option value="user">Kullanıcı (User)</option>
                                <option value="admin">Yönetici (Admin)</option>
                            </select>
                             {isEditingSelf && <p className="text-xs text-slate-500 mt-1">Kendi rolünüzü değiştiremezsiniz.</p>}
                        </div>
                    </div>
                    <div className="mt-6 flex justify-end gap-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600" disabled={isSubmitting}>Vazgeç</button>
                        <button type="submit" className="px-4 py-2 rounded-xl btn-brand min-w-[120px]" disabled={isSubmitting}>
                            {isSubmitting ? 'Kaydediliyor...' : 'Kaydet'}
                        </button>
                    </div>
                </form>
            )}
        </dialog>
    );
};


const UserManagement: React.FC = () => {
    const { dataStore, pushData } = useData();
    const { showConfirmation, showToast } = useUI();
    const { user: currentUser } = useAuth();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);

    const users = useMemo(() => dataStore.users || [], [dataStore.users]);
    const adminCount = useMemo(() => users.filter(u => u.role === 'admin').length, [users]);

    const handleAdd = () => {
        setSelectedUser(null);
        setIsModalOpen(true);
    };

    const handleEdit = (user: AppUser) => {
        setSelectedUser(user);
        setIsModalOpen(true);
    };

    const handleDelete = (userToDelete: AppUser) => {
        if (currentUser?.username === userToDelete.username) {
            showToast("Kendi hesabınızı silemezsiniz.", "error");
            return;
        }
        if (userToDelete.role === 'admin' && adminCount <= 1) {
            showToast("Son yönetici hesabı silinemez.", "error");
            return;
        }

        showConfirmation({
            title: "Kullanıcıyı Sil",
            message: `'${userToDelete.username}' adlı kullanıcı kalıcı olarak silinecektir. Bu işlem geri alınamaz.`,
            confirmText: "Evet, Sil",
            requiresInput: null,
            onConfirm: () => {
                return pushData('users', (prevUsers: AppUser[] = []) =>
                    prevUsers.filter(u => u.id !== userToDelete.id)
                ).then(() => {
                    showToast("Kullanıcı silindi.", "success");
                });
            }
        });
    };

    return (
        <div className="mx-auto max-w-4xl p-3 md:p-4">
            <div className="flex flex-wrap justify-between items-center mb-4 gap-4">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Kullanıcı Yönetimi</h2>
                <button onClick={handleAdd} className="px-4 py-2 rounded-xl btn-brand flex items-center gap-2">
                    <Icon name="plus" size={18} />
                    <span>Yeni Kullanıcı Ekle</span>
                </button>
            </div>
            
            <div className="overflow-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                <table className="w-full text-sm responsive-table">
                    <thead className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                        <tr>
                            <th className="text-left px-4 py-3">Kullanıcı Adı</th>
                            <th className="text-left px-4 py-3">Rol</th>
                            <th className="text-right px-4 py-3">İşlemler</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {users.map(user => (
                            <tr key={user.id}>
                                <td data-label="Kullanıcı Adı" className="p-4 font-medium capitalize">{user.username}</td>
                                <td data-label="Rol" className="p-4">
                                    <span className={`px-2 py-1 text-xs font-semibold rounded-full capitalize ${user.role === 'admin' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200' : 'bg-slate-100 text-slate-800 dark:bg-slate-600 dark:text-slate-200'}`}>
                                        {user.role}
                                    </span>
                                </td>
                                <td data-label="İşlemler" className="p-4 text-right">
                                    <div className="flex justify-end items-center gap-2">
                                        <button onClick={() => handleEdit(user)} className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 text-xs">Düzenle</button>
                                        <button onClick={() => handleDelete(user)} className="px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-700/50 bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs">Sil</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            <UserFormModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                user={selectedUser}
            />
        </div>
    );
};

export default UserManagement;
