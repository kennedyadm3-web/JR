import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy, setDoc, Timestamp, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError } from '../lib/firestore-utils';
import { Client, Address, MaintenanceRecord, MaintenanceStatus, OperationType, Technician, ServiceCall, RouteConfiguration, RouteType } from '../types';
import { historyService } from './historyService';
import { format } from 'date-fns';

const COLLECTIONS = {
  CLIENTS: 'clients',
  ADDRESSES: 'addresses',
  RECORDS: 'maintenanceRecords',
  TECHNICIANS: 'technicians',
  HISTORY: 'editHistory',
  SERVICE_CALLS: 'serviceCalls',
  ROUTE_CONFIGS: 'routeConfigurations'
};

const clean = (obj: any) => {
  const result = { ...obj };
  Object.keys(result).forEach(key => {
    if (result[key] === undefined) {
      delete result[key];
    }
  });
  return result;
};

export const dataService = {
  // Route Configurations
  async getRouteConfigs(): Promise<RouteConfiguration[]> {
    try {
      const snapshot = await getDocs(collection(db, COLLECTIONS.ROUTE_CONFIGS));
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RouteConfiguration));
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, COLLECTIONS.ROUTE_CONFIGS);
      return [];
    }
  },

  async upsertRouteConfig(config: RouteConfiguration) {
    try {
      const { id, ...data } = config;
      await setDoc(doc(db, COLLECTIONS.ROUTE_CONFIGS, id), clean({
        ...data,
        updatedAt: serverTimestamp()
      }));
      await historyService.log(id, 'RouteConfiguration', 'Upsert', data);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, COLLECTIONS.ROUTE_CONFIGS);
    }
  },

  async syncRouteTechnicians(month: string, routeName: string, tech1?: string, tech2?: string) {
    try {
      // 1. Get all addresses for this route
      const addresses = await this.getAddresses();
      const routeAddressIds = addresses.filter(a => a.route === routeName).map(a => a.id);
      
      if (routeAddressIds.length === 0) return;

      // 2. Get records for this month and route
      const records = await this.getRecords(month);
      const recordsToUpdate = records.filter(r => routeAddressIds.includes(r.addressId));

      // 3. Update them
      const promises = recordsToUpdate.map(r => 
        this.upsertRecord({
          ...r,
          technician1: tech1 || r.technician1,
          technician2: tech2 || r.technician2
        })
      );
      await Promise.all(promises);
    } catch (e) {
      console.error('Error syncing route technicians:', e);
    }
  },

  async deleteRouteConfig(id: string) {
    try {
      await deleteDoc(doc(db, COLLECTIONS.ROUTE_CONFIGS, id));
      await historyService.log(id, 'RouteConfiguration', 'Delete', { message: 'Configuração de rota removida' });
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `${COLLECTIONS.ROUTE_CONFIGS}/${id}`);
    }
  },

  async deleteRoute(routeName: string) {
    try {
      const { writeBatch, doc } = await import('firebase/firestore');
      const batch = writeBatch(db);

      // 1. Unassign from all addresses
      const addresses = await this.getAddresses();
      const addressesToUpdate = addresses.filter(a => a.route === routeName);
      
      addressesToUpdate.forEach(addr => {
        batch.update(doc(db, COLLECTIONS.ADDRESSES, addr.id), { route: '' });
      });

      // 2. Delete Route Configuration
      batch.delete(doc(db, COLLECTIONS.ROUTE_CONFIGS, routeName));

      await batch.commit();
      await historyService.log(routeName, 'Route', 'Delete', { message: `Rota ${routeName} removida por completo`, count: addressesToUpdate.length });
    } catch (e) {
      console.error('Error deleting route:', e);
      throw e;
    }
  },

  async renameRoute(oldName: string, newName: string) {
    try {
      const { writeBatch, doc } = await import('firebase/firestore');
      const batch = writeBatch(db);

      // 1. Update all addresses
      const addresses = await this.getAddresses();
      const addressesToUpdate = addresses.filter(a => a.route === oldName);
      
      addressesToUpdate.forEach(addr => {
        batch.update(doc(db, COLLECTIONS.ADDRESSES, addr.id), { route: newName });
      });

      // 2. Move Route Configuration (Delete old, set new)
      const configs = await this.getRouteConfigs();
      const oldConfig = configs.find(c => c.id === oldName);
      
      if (oldConfig) {
        batch.delete(doc(db, COLLECTIONS.ROUTE_CONFIGS, oldName));
        batch.set(doc(db, COLLECTIONS.ROUTE_CONFIGS, newName), clean({
          ...oldConfig,
          id: newName,
          routeName: newName,
          updatedAt: serverTimestamp()
        }));
      }

      await batch.commit();
      await historyService.log(oldName, 'Route', 'Rename', { from: oldName, to: newName, count: addressesToUpdate.length });
    } catch (e) {
      console.error('Error renaming route:', e);
      throw e;
    }
  },

  // Clients
  async getClients(): Promise<Client[]> {
    try {
      const q = query(collection(db, COLLECTIONS.CLIENTS));
      const snapshot = await getDocs(q);
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
      return items.sort((a, b) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, COLLECTIONS.CLIENTS);
      return [];
    }
  },

  async addClient(client: Omit<Client, 'id'>) {
    try {
      const docRef = await addDoc(collection(db, COLLECTIONS.CLIENTS), {
        ...clean(client),
        createdAt: serverTimestamp()
      });
      await historyService.log(docRef.id, 'Client', 'Create', client);
      return docRef;
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, COLLECTIONS.CLIENTS);
    }
  },

  async updateClient(id: string, data: Partial<Client>) {
    try {
      await updateDoc(doc(db, COLLECTIONS.CLIENTS, id), clean(data));
      await historyService.log(id, 'Client', 'Update', data);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `${COLLECTIONS.CLIENTS}/${id}`);
    }
  },

  async deleteClient(id: string) {
    try {
      await deleteDoc(doc(db, COLLECTIONS.CLIENTS, id));
      await historyService.log(id, 'Client', 'Delete', { message: 'Cliente removido' });
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `${COLLECTIONS.CLIENTS}/${id}`);
    }
  },

  // Addresses
  async getAddresses(): Promise<Address[]> {
    try {
      const snapshot = await getDocs(collection(db, COLLECTIONS.ADDRESSES));
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Address));
      return items.sort((a, b) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, COLLECTIONS.ADDRESSES);
      return [];
    }
  },

  async addAddress(address: Omit<Address, 'id'>) {
    try {
      const docRef = await addDoc(collection(db, COLLECTIONS.ADDRESSES), {
        ...clean(address),
        createdAt: serverTimestamp()
      });
      await historyService.log(docRef.id, 'Address', 'Create', address);

      // Auto-create record for current month
      const currentMonth = format(new Date(), 'yyyy-MM');
      const routeConfigs = await this.getRouteConfigs();
      const config = routeConfigs.find(c => c.id === address.route && c.type === RouteType.FIXED);

      await this.upsertRecord({
        month: currentMonth,
        addressId: docRef.id,
        status: MaintenanceStatus.PENDING,
        scheduledWeek: 1, // Default to first week
        technician1: config?.technician1 || '',
        technician2: config?.technician2 || '',
        notes: ''
      } as MaintenanceRecord);

      return docRef;
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, COLLECTIONS.ADDRESSES);
    }
  },

  async updateAddress(id: string, data: Partial<Address>) {
    try {
      await updateDoc(doc(db, COLLECTIONS.ADDRESSES, id), clean(data));
      await historyService.log(id, 'Address', 'Update', data);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `${COLLECTIONS.ADDRESSES}/${id}`);
    }
  },

  async deleteAddress(id: string) {
    try {
      await deleteDoc(doc(db, COLLECTIONS.ADDRESSES, id));
      await historyService.log(id, 'Address', 'Delete', { message: 'Endereço removido' });
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `${COLLECTIONS.ADDRESSES}/${id}`);
    }
  },

  // Maintenance Records
  async getRecords(month: string): Promise<MaintenanceRecord[]> {
    try {
      const q = query(collection(db, COLLECTIONS.RECORDS), where('month', '==', month));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MaintenanceRecord));
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, COLLECTIONS.RECORDS);
      return [];
    }
  },

  async getAllRecords(): Promise<MaintenanceRecord[]> {
    try {
      const snapshot = await getDocs(collection(db, COLLECTIONS.RECORDS));
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MaintenanceRecord));
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, COLLECTIONS.RECORDS);
      return [];
    }
  },

  async getRecordsByAddress(addressId: string): Promise<MaintenanceRecord[]> {
    try {
      const q = query(collection(db, COLLECTIONS.RECORDS), where('addressId', '==', addressId));
      const snapshot = await getDocs(q);
      const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MaintenanceRecord));
      // Sort by month descending
      return records.sort((a,b) => b.month.localeCompare(a.month));
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, COLLECTIONS.RECORDS);
      return [];
    }
  },

  async upsertRecord(record: Omit<MaintenanceRecord, 'id'> & { id?: string }) {
    try {
      if (record.id) {
        const { id, ...data } = record;
        await updateDoc(doc(db, COLLECTIONS.RECORDS, id), clean(data));
        await historyService.log(id, 'MaintenanceRecord', 'Update', data);
        return id;
      } else {
        const docRef = await addDoc(collection(db, COLLECTIONS.RECORDS), clean(record));
        await historyService.log(docRef.id, 'MaintenanceRecord', 'Create', record);
        return docRef.id;
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, COLLECTIONS.RECORDS);
      return null;
    }
  },

  async deleteRecord(id: string) {
    try {
      await deleteDoc(doc(db, COLLECTIONS.RECORDS, id));
      await historyService.log(id, 'MaintenanceRecord', 'Delete', { message: 'Registro de manutenção removido' });
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `${COLLECTIONS.RECORDS}/${id}`);
    }
  },

  // Technicians
  async getTechnicians(): Promise<Technician[]> {
    try {
      const snapshot = await getDocs(collection(db, COLLECTIONS.TECHNICIANS));
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Technician));
      return items.sort((a, b) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, COLLECTIONS.TECHNICIANS);
      return [];
    }
  },

  async addTechnician(name: string) {
    try {
      const docRef = await addDoc(collection(db, COLLECTIONS.TECHNICIANS), { name, createdAt: serverTimestamp() });
      await historyService.log(docRef.id, 'Technician', 'Create', { name });
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, COLLECTIONS.TECHNICIANS);
    }
  },

  async updateTechnician(id: string, name: string) {
    try {
      await updateDoc(doc(db, COLLECTIONS.TECHNICIANS, id), { name });
      await historyService.log(id, 'Technician', 'Update', { name });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `${COLLECTIONS.TECHNICIANS}/${id}`);
    }
  },

  async deleteTechnician(id: string) {
    try {
      await deleteDoc(doc(db, COLLECTIONS.TECHNICIANS, id));
      await historyService.log(id, 'Technician', 'Delete', { message: 'Técnico removido' });
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `${COLLECTIONS.TECHNICIANS}/${id}`);
    }
  },

  // Logistics: Generate Monthly Schedule
  async generateMonthSchedule(month: string, prevMonth?: string) {
    try {
      // 1. Get all addresses
      const addresses = await this.getAddresses();
      if (addresses.length === 0) {
        throw new Error('Nenhum endereço cadastrado. Cadastre endereços antes de gerar o cronograma.');
      }

      // 2. Get existing records for this month (avoid duplicates)
      const existing = await this.getRecords(month);
      const existingAddressIds = new Set(existing.map(r => r.addressId));

      // 3. (Optional) Check prevMonth for pending tasks (Carry Over logic)
      let prioritaryIds = new Set<string>();
      if (prevMonth) {
        const prevRecords = await this.getRecords(prevMonth);
        prevRecords.forEach(r => {
          if (r.status !== MaintenanceStatus.COMPLETED) {
            prioritaryIds.add(r.addressId);
          }
        });
      }

      // 4. Get route configs to apply fixed technicians
      const routeConfigs = await this.getRouteConfigs();

      const batch = [];
      for (const addr of addresses) {
        if (!existingAddressIds.has(addr.id)) {
          const config = routeConfigs.find(c => c.id === addr.route && c.type === RouteType.FIXED);
          
          batch.push({
            month,
            addressId: addr.id,
            scheduledWeek: 1, 
            status: MaintenanceStatus.PENDING,
            technician1: config?.technician1 || '',
            technician2: config?.technician2 || '',
            notes: prioritaryIds.has(addr.id) ? 'PRIORIDADE: Pendente do mês anterior' : ''
          });
        }
      }

      if (batch.length === 0) {
        return 0;
      }

      for (const item of batch) {
        await this.upsertRecord(item as any);
      }
      return batch.length;
    } catch (e: any) {
      console.error('Error generating schedule:', e);
      throw e;
    }
  },

  async duplicateSchedule(fromMonth: string, toMonth: string, options: { keepTechnicians: boolean, keepWeeks: boolean }) {
    try {
      const { writeBatch, doc, collection } = await import('firebase/firestore');
      
      const sourceRecords = await this.getRecords(fromMonth);
      if (sourceRecords.length === 0) {
        throw new Error('Não há registros no mês anterior para duplicar.');
      }

      const existingRecords = await this.getRecords(toMonth);
      const existingAddressIds = new Set(existingRecords.map(r => r.addressId));

      const recordsToCreate = sourceRecords.filter(src => !existingAddressIds.has(src.addressId) && !src.isTemporaryRoute);
      
      if (recordsToCreate.length === 0) return 0;

      // Firestore batches are limited to 500 operations
      const BATCH_SIZE = 450; 
      let totalCreated = 0;

      for (let i = 0; i < recordsToCreate.length; i += BATCH_SIZE) {
        const chunk = recordsToCreate.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);

        chunk.forEach(src => {
          const newRecordRef = doc(collection(db, COLLECTIONS.RECORDS));
          const newRecord = {
            month: toMonth,
            addressId: src.addressId,
            scheduledWeek: options.keepWeeks ? src.scheduledWeek : 1,
            technician1: options.keepTechnicians ? (src.technician1 || '') : '',
            technician2: options.keepTechnicians ? (src.technician2 || '') : '',
            status: MaintenanceStatus.PENDING,
            // Limpando campos de execução conforme pedido
            plannedDate: null,
            returnDate: null,
            executionDate: null,
            executedQuantity: 0,
            attachmentUrl: '',
            notes: src.status !== MaintenanceStatus.COMPLETED ? 'PRIORIDADE: Pendente do mês anterior' : ''
          };
          batch.set(newRecordRef, newRecord);
        });

        await batch.commit();
        totalCreated += chunk.length;
      }

      await historyService.log('batch-replication', 'MaintenanceRecord', 'Replicate', { 
        fromMonth, toMonth, count: totalCreated, options 
      });

      return totalCreated;
    } catch (e: any) {
      console.error('Error duplicating schedule:', e);
      throw e;
    }
  },

  // Service Calls
  async getServiceCalls(): Promise<ServiceCall[]> {
    try {
      const q = query(collection(db, COLLECTIONS.SERVICE_CALLS), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ServiceCall));
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, COLLECTIONS.SERVICE_CALLS);
      return [];
    }
  },

  async addServiceCall(call: Omit<ServiceCall, 'id'>) {
    try {
      const docRef = await addDoc(collection(db, COLLECTIONS.SERVICE_CALLS), {
        ...call,
        createdAt: serverTimestamp()
      });
      await historyService.log(docRef.id, 'ServiceCall', 'Create', call);
      return docRef;
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, COLLECTIONS.SERVICE_CALLS);
    }
  },

  async updateServiceCall(id: string, data: Partial<ServiceCall>) {
    try {
      const updateData = { ...data };
      if (data.status === 'resolved' && !data.resolvedAt) {
        updateData.resolvedAt = Timestamp.now();
      }
      await updateDoc(doc(db, COLLECTIONS.SERVICE_CALLS, id), updateData);
      await historyService.log(id, 'ServiceCall', 'Update', data);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `${COLLECTIONS.SERVICE_CALLS}/${id}`);
    }
  },

  async deleteServiceCall(id: string) {
    try {
      await deleteDoc(doc(db, COLLECTIONS.SERVICE_CALLS, id));
      await historyService.log(id, 'ServiceCall', 'Delete', { message: 'Chamado removido' });
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `${COLLECTIONS.SERVICE_CALLS}/${id}`);
    }
  }
};
