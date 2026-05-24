import { collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { OperationType } from '../types';

export const historyService = {
  async log(entityId: string, entityType: string, action: string, changes: any) {
    try {
      await addDoc(collection(db, 'editHistory'), {
        entityId,
        entityType,
        action,
        changes,
        userId: auth.currentUser?.email || 'System',
        timestamp: new Date().toISOString()
      });
    } catch (e) {
      console.error('History log error:', e);
    }
  },

  async getLogs() {
    try {
      const q = query(collection(db, 'editHistory'), orderBy('timestamp', 'desc'), limit(50));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
      console.error(e);
      return [];
    }
  }
};
