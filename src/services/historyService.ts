import { collection, addDoc, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

export interface HistoryLogEntry {
  id: string;
  entityId: string;
  entityType: string;
  action: string;
  changes: any;
  userId: string;
  timestamp: string;
}

export const historyService = {
  async log(entityId: string, entityType: string, action: string, changes: any, customUser?: string) {
    try {
      let resolvedUser = customUser?.trim();
      if (!resolvedUser) {
        resolvedUser = auth.currentUser?.email || 
          (typeof window !== 'undefined' ? (localStorage.getItem('lefrio_user_email') || localStorage.getItem('user_email')) : null) || 
          'Administrativo';
      }

      await addDoc(collection(db, 'editHistory'), {
        entityId,
        entityType,
        action,
        changes,
        userId: resolvedUser,
        timestamp: new Date().toISOString()
      });
    } catch (e) {
      console.error('History log error:', e);
    }
  },

  async getLogs(limitCount = 120): Promise<HistoryLogEntry[]> {
    try {
      const q = query(collection(db, 'editHistory'), orderBy('timestamp', 'desc'), limit(limitCount));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) })) as HistoryLogEntry[];
    } catch (e) {
      console.error('Erro ao buscar histórico:', e);
      return [];
    }
  }
};
