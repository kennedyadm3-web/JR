import { 
  collection, 
  getDocs as firestoreGetDocs, 
  getDoc as firestoreGetDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  deleteField,
  doc, 
  query, 
  where, 
  orderBy, 
  limit,
  startAfter,
  setDoc, 
  Timestamp, 
  serverTimestamp, 
  writeBatch,
  getDocsFromCache,
  getDocFromCache,
  onSnapshot
} from 'firebase/firestore';

// Wrappers resilientes para funcionamento offline sem internet e proteção contra carregamento infinito
const fetchWithTimeout = <T>(promise: Promise<T>, ms: number = 8000, errorMsg = 'Timeout'): Promise<T> => {
  let timer: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${errorMsg} (${ms}ms)`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
};

const getDocs = async (q: any): Promise<any> => {
  try {
    return await fetchWithTimeout(firestoreGetDocs(q), 8000, 'Firestore getDocs timeout');
  } catch (error) {
    console.warn('[Offline Mode/Timeout] Falha ao obter dados do servidor. Buscando do cache local...', error);
    try {
      return await getDocsFromCache(q);
    } catch (cacheErr) {
      console.error('[Offline Mode] Falha crítica ao ler do cache local:', cacheErr);
      throw error;
    }
  }
};

const getDoc = async (docRef: any): Promise<any> => {
  try {
    return await fetchWithTimeout(firestoreGetDoc(docRef), 8000, 'Firestore getDoc timeout');
  } catch (error) {
    console.warn('[Offline Mode/Timeout] Falha ao obter documento do servidor. Buscando do cache local...', error);
    try {
      return await getDocFromCache(docRef);
    } catch (cacheErr) {
      console.error('[Offline Mode] Falha crítica ao ler documento do cache local:', cacheErr);
      throw error;
    }
  }
};
import { db } from '../lib/firebase';
import { handleFirestoreError } from '../lib/firestore-utils';
import { Client, Address, MaintenanceRecord, MaintenanceStatus, OperationType, Technician, ServiceCall, RouteConfiguration, RouteType, Adjustment, UserProfile, NotificationItem, Task, TaskStatus, TaskPriority, MuralPost, Inspection, TravelCard, ContractPerformance, Equipment, DeviceSettings, UserRole, JettingControl, RouteMonthlyPlanning, ServiceOrder, ServiceOrderItem, ServiceOrderSettings, ServiceCompanyConfig, ServiceCatalogItem, ClientPriceOverride, RouteExpense, RouteExpenseStatus, isOSRecord } from '../types';
import { historyService } from './historyService';
import { format } from 'date-fns';
import { sortOrdersByCreationDateDesc } from '../lib/utils';

const COLLECTIONS = {
  CLIENTS: 'clients',
  ADDRESSES: 'addresses',
  RECORDS: 'maintenanceRecords',
  TECHNICIANS: 'technicians',
  HISTORY: 'editHistory',
  SERVICE_CALLS: 'serviceCalls',
  ROUTE_CONFIGS: 'routeConfigurations',
  ADJUSTMENTS: 'adjustments',
  USERS: 'users',
  NOTIFICATIONS: 'notifications',
  TASKS: 'tasks',
  MURAL_POSTS: 'muralPosts',
  INSPECTIONS: 'inspections',
  TRAVEL_CARDS: 'travelCards',
  CONTRACT_PERFORMANCE: 'contractsPerformance',
  EQUIPMENTS: 'equipments',
  JETTING_CONTROL: 'jettingControl',
  ROUTE_PLANNINGS: 'routePlannings',
  SERVICE_ORDERS: 'serviceOrders',
  SERVICE_CATALOG: 'serviceCatalog',
  ROUTE_EXPENSES: 'routeExpenses'
};

const clean = (obj: any): any => {
  if (obj === null || obj === undefined) {
    return undefined;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => clean(item)).filter(item => item !== undefined);
  }
  
  if (typeof obj === 'object') {
    const proto = Object.getPrototypeOf(obj);
    if (proto !== null && proto !== Object.prototype) {
      return obj;
    }
    
    const result: any = {};
    Object.keys(obj).forEach(key => {
      const val = clean(obj[key]);
      if (val !== undefined) {
        result[key] = val;
      }
    });
    return result;
  }
  
  return obj;
};

export const deduplicateRecordsList = (records: MaintenanceRecord[]): { deduplicated: MaintenanceRecord[]; duplicateIds: string[] } => {
  const map = new Map<string, MaintenanceRecord>();
  const duplicateIds: string[] = [];

  for (const r of records) {
    if (!r) continue;
    // Registros gerados para O.S. não pertencem ao cronograma de preventivas; não inclui no mapa
    if (isOSRecord(r)) {
      continue;
    }
    const normR = normalizeMaintenanceRecordStatus(r);
    const isTemp = normR.isTemporaryRoute;
    const key = isTemp
      ? `temp_${normR.month || ''}_${(normR.temporaryRouteName || '').trim()}_${(normR.temporaryStreet || normR.temporaryClient || normR.id).trim()}`
      : `${normR.month || ''}_${normR.addressId}`;

    const canonicalId = (!isTemp && normR.month && normR.addressId) ? `${normR.month}_${normR.addressId}` : null;
    const isCanonical = canonicalId && normR.id === canonicalId;

    if (!map.has(key)) {
      const initial: MaintenanceRecord = { ...normR };
      // REGRA MANDATÓRIA: Cada endereço possui estritamente UMA ÚNICA data prevista
      if (initial.plannedDate) {
        initial.plannedDates = undefined;
        initial.returnDate = undefined;
      }
      map.set(key, initial);
    } else {
      const existing = map.get(key)!;
      const existingIsCanonical = canonicalId && existing.id === canonicalId;

      // If document IDs differ, mark non-canonical as duplicate
      if (normR.id && normR.id !== existing.id) {
        if (isCanonical && !existingIsCanonical) {
          duplicateIds.push(existing.id);
        } else {
          duplicateIds.push(normR.id);
        }
      }

      // Se o novo registro for o canônico (salvo pelo cronograma oficial), seus dados de agendamento têm prioridade
      if (isCanonical && !existingIsCanonical) {
        existing.id = canonicalId;
        if (normR.plannedDate) existing.plannedDate = normR.plannedDate;
        if (normR.technician1) existing.technician1 = normR.technician1;
        if (normR.technician2) existing.technician2 = normR.technician2;
        if (normR.scheduledWeek) existing.scheduledWeek = normR.scheduledWeek;
      }

      // REGRA CRÍTICA DE HOMOLOGAÇÃO:
      // O erro de desvio do fluxo de aprovação ocorreu somente a partir de ontem (28/09/2026).
      // Atendimentos com data anterior a 28/09/2026 já foram aprovados pelo administrativo!
      const normExisting = normalizeMaintenanceRecordStatus(existing);
      const isRApproved = Boolean(normR.adminApproved || normR.approvedAt || normR.approvedBy);
      const isExistingApproved = Boolean(normExisting.adminApproved || normExisting.approvedAt || normExisting.approvedBy);
      
      const rDate = normR.completionDate || normR.clientSignatureDate || normR.executionDate || normR.plannedDate || '';
      const rDateStr = typeof rDate === 'string' ? rDate.slice(0, 10) : '';
      const isRecentR = !rDateStr || rDateStr >= '2026-09-28';

      const existingDate = normExisting.completionDate || normExisting.clientSignatureDate || normExisting.executionDate || normExisting.plannedDate || '';
      const existingDateStr = typeof existingDate === 'string' ? existingDate.slice(0, 10) : '';
      const isRecentExisting = !existingDateStr || existingDateStr >= '2026-09-28';

      // REGRA INVIOLÁVEL: É impossível ter uma folha de atendimento finalizada pelo técnico sem assinatura.
      // O sistema só aceita finalizar o atendimento se tiver preenchido nome do cliente, matrícula e assinatura.
      const hasSigR = Boolean(normR.clientSignature && typeof normR.clientSignature === 'string' && normR.clientSignature.trim().length > 10);
      const hasNameR = Boolean(normR.clientSigneeName && typeof normR.clientSigneeName === 'string' && normR.clientSigneeName.trim().length >= 3);
      const hasRegR = Boolean(normR.clientSigneeRegistration && typeof normR.clientSigneeRegistration === 'string' && normR.clientSigneeRegistration.trim().length >= 3);
      const isFieldFinalizedR = hasSigR && hasNameR && hasRegR;

      const hasSigEx = Boolean(normExisting.clientSignature && typeof normExisting.clientSignature === 'string' && normExisting.clientSignature.trim().length > 10);
      const hasNameEx = Boolean(normExisting.clientSigneeName && typeof normExisting.clientSigneeName === 'string' && normExisting.clientSigneeName.trim().length >= 3);
      const hasRegEx = Boolean(normExisting.clientSigneeRegistration && typeof normExisting.clientSigneeRegistration === 'string' && normExisting.clientSigneeRegistration.trim().length >= 3);
      const isFieldFinalizedEx = hasSigEx && hasNameEx && hasRegEx;

      const rAwaitingApproval = (normR.status === MaintenanceStatus.PRE_COMPLETED && isFieldFinalizedR && isRecentR) || (isFieldFinalizedR && !isRApproved && isRecentR);
      const existingAwaitingApproval = (normExisting.status === MaintenanceStatus.PRE_COMPLETED && isFieldFinalizedEx && isRecentExisting) || (isFieldFinalizedEx && !isExistingApproved && isRecentExisting);

      if ((rAwaitingApproval && !isExistingApproved) || (existingAwaitingApproval && !isRApproved)) {
        existing.status = MaintenanceStatus.PRE_COMPLETED;
        existing.routeStatus = MaintenanceStatus.PRE_COMPLETED;
      } else {
        // Status priority: COMPLETED > PRE_COMPLETED > PARTIAL > PENDING
        const statusWeight: Record<string, number> = {
          [MaintenanceStatus.COMPLETED]: 4,
          [MaintenanceStatus.PRE_COMPLETED]: 3,
          [MaintenanceStatus.PARTIAL]: 2,
          [MaintenanceStatus.PENDING]: 1,
        };
        if ((statusWeight[normR.status] || 0) > (statusWeight[existing.status] || 0)) {
          existing.status = normR.status;
        }
      }

      if (normR.adminApproved) existing.adminApproved = normR.adminApproved;
      if (normR.approvedAt) existing.approvedAt = normR.approvedAt;
      if (normR.approvedBy) existing.approvedBy = normR.approvedBy;

      // Technicians: prefer filled value or canonical value
      if (normR.technician1) {
        if (!existing.technician1 || isCanonical) existing.technician1 = normR.technician1;
      }
      if (normR.technician2) {
        if (!existing.technician2 || isCanonical) existing.technician2 = normR.technician2;
      }

      // Execution details
      if (normR.executionDate && !existing.executionDate) existing.executionDate = normR.executionDate;
      if (normR.executedQuantity && !existing.executedQuantity) existing.executedQuantity = normR.executedQuantity;
      if (normR.checklist && (!existing.checklist || existing.checklist.length === 0)) existing.checklist = normR.checklist;
      if (normR.clientSignature && !existing.clientSignature) {
        existing.clientSignature = normR.clientSignature;
        existing.clientSignatureDate = normR.clientSignatureDate;
        existing.clientSigneeName = normR.clientSigneeName;
        existing.clientSigneeRegistration = normR.clientSigneeRegistration;
      }
      if (normR.techSignature && !existing.techSignature) existing.techSignature = normR.techSignature;

      // REGRA MANDATÓRIA: Endereços NÃO podem ter múltiplas datas agendadas.
      // A data mais recente definida sobrescreve qualquer data anterior.
      if (normR.plannedDate && (isCanonical || !existing.plannedDate || normR.plannedDate !== existing.plannedDate)) {
        existing.plannedDate = normR.plannedDate;
      }
      existing.plannedDates = undefined;
      existing.returnDate = undefined;

      // Preserve enriched relations (address, client) if present
      if ((normR as any).address && !(existing as any).address) {
        (existing as any).address = (normR as any).address;
      }
      if ((normR as any).client && !(existing as any).client) {
        (existing as any).client = (normR as any).client;
      }

      // Notes
      if (normR.notes && normR.notes !== existing.notes && !existing.notes?.includes(normR.notes)) {
        existing.notes = existing.notes ? `${existing.notes} | ${normR.notes}` : normR.notes;
      }
      if (normR.routeNotes && normR.routeNotes !== existing.routeNotes && !existing.routeNotes?.includes(normR.routeNotes)) {
        existing.routeNotes = existing.routeNotes ? `${existing.routeNotes} | ${normR.routeNotes}` : normR.routeNotes;
      }
    }
  }

  // REGRA MANDATÓRIA: Endereços têm estritamente UMA ÚNICA data prevista ativa
  // Se um endereço possui registros múltiplos em meses diferentes, garante que apenas o mais recente/agendado mantém plannedDate
  const byAddressId = new Map<string, MaintenanceRecord[]>();
  for (const item of map.values()) {
    if (!item.addressId || item.isTemporaryRoute) continue;
    if (!byAddressId.has(item.addressId)) byAddressId.set(item.addressId, []);
    byAddressId.get(item.addressId)!.push(item);
  }

  for (const [_, list] of byAddressId.entries()) {
    if (list.length <= 1) continue;
    const withPlannedDate = list.filter(it => Boolean(it.plannedDate));
    if (withPlannedDate.length > 1) {
      withPlannedDate.sort((a, b) => {
        const score = (rec: any) => {
          let pts = 0;
          if (rec.status === MaintenanceStatus.COMPLETED) pts += 100;
          if (rec.status === MaintenanceStatus.PRE_COMPLETED) pts += 50;
          if (rec.executionDate) pts += 40;
          if (rec.checklist && Array.isArray(rec.checklist) && rec.checklist.some((it: any) => it?.checked)) pts += 30;
          if (rec.technician1) pts += 10;
          return pts;
        };
        const sDiff = score(b) - score(a);
        if (sDiff !== 0) return sDiff;
        const mb = b.month || '';
        const ma = a.month || '';
        const mDiff = mb.localeCompare(ma);
        if (mDiff !== 0) return mDiff;
        const da = a.plannedDate || '';
        const db = b.plannedDate || '';
        return db.localeCompare(da);
      });
      // REGRA MANDATÓRIA: Somente uma data para cada endereço! O registro prioritário é o único que mantém a data prevista ativa.
      for (const loser of withPlannedDate.slice(1)) {
        loser.plannedDate = undefined;
        loser.plannedDates = undefined;
        loser.returnDate = undefined;
      }
    }
  }

  return { deduplicated: Array.from(map.values()), duplicateIds };
};

// Cache em memória para reduzir leituras no Firestore e otimizar velocidade
interface CacheEntry {
  data: any;
  timestamp: number;
}

const memoryCache: Record<string, CacheEntry> = {};
const CACHE_TTL = 10000; // 10 segundos de TTL (ideal para operações em lote, carregamentos paralelos de abas e navegação rápida)

const getCachedData = async (key: string, fetchFn: () => Promise<any>): Promise<any> => {
  const now = Date.now();
  const cached = memoryCache[key];
  if (cached && (now - cached.timestamp < CACHE_TTL)) {
    return cached.data;
  }
  const freshData = await fetchFn();
  memoryCache[key] = { data: freshData, timestamp: now };
  return freshData;
};

const clearCache = (prefix?: string) => {
  if (prefix) {
    Object.keys(memoryCache).forEach(key => {
      if (key.startsWith(prefix)) {
        delete memoryCache[key];
      }
    });
  } else {
    Object.keys(memoryCache).forEach(key => {
      delete memoryCache[key];
    });
  }
};

// Função auxiliar para garantir a regra absoluta de negócios da Le Frio:
// Somente o sistema administrativo tem autonomia para finalizar uma O.S.
// O técnico ao finalizar o atendimento no aplicativo envia a O.S. com status 'aberta' para o ADM.
// Caso alguma O.S. chegue ou tenha sido gravada como 'finalizada' sem a aprovação administrativa (adminFinalized === true),
// ela deve ser imediatamente tratada com status 'aberta' (Em aberto), preservando techFinalized: true.
function normalizeServiceOrderStatus(order: ServiceOrder): ServiceOrder {
  if (!order) return order;
  if (!order.adminFinalized && order.status === 'finalizada') {
    return {
      ...order,
      status: 'aberta',
      techFinalized: true
    };
  }
  return order;
}

// REGRA ABSOLUTA DE NEGÓCIOS DA LE FRIO (PREVENTIVAS):
// É IMPOSSÍVEL ter uma folha de atendimento finalizada pelo técnico sem assinatura.
// O sistema só aceita finalizar o atendimento se tiver preenchido: nome do cliente, matrícula e assinatura digital.
// Caso contrário, o atendimento NÃO foi finalizado e continua como PENDING na rota do técnico.
export function normalizeMaintenanceRecordStatus(record: MaintenanceRecord): MaintenanceRecord {
  if (!record) return record;
  const hasSignature = Boolean(record.clientSignature && typeof record.clientSignature === 'string' && record.clientSignature.trim().length > 10);
  const hasSignee = Boolean(record.clientSigneeName && typeof record.clientSigneeName === 'string' && record.clientSigneeName.trim().length >= 3);
  const hasRegistration = Boolean(record.clientSigneeRegistration && typeof record.clientSigneeRegistration === 'string' && record.clientSigneeRegistration.trim().length >= 3);
  const isFieldFinalized = hasSignature && hasSignee && hasRegistration;

  const isFormallyApproved = Boolean(record.adminApproved || record.approvedAt || record.approvedBy);

  // Se um registro está com status PRE_COMPLETED mas NÃO foi homologado pelo ADM e NÃO tem assinatura completa,
  // ele foi marcado indevidamente ou é um rascunho em andamento. Deve permanecer como PENDING!
  if (!isFormallyApproved && record.status === MaintenanceStatus.PRE_COMPLETED && !isFieldFinalized) {
    return {
      ...record,
      status: MaintenanceStatus.PENDING,
      routeStatus: MaintenanceStatus.PENDING,
      completionDate: undefined
    };
  }

  const recordDate = record.completionDate || record.clientSignatureDate || record.executionDate || record.plannedDate || '';
  const dateStr = typeof recordDate === 'string' ? recordDate.slice(0, 10) : '';
  const isRecentOrFuture = !dateStr || dateStr >= '2026-09-28';

  if (isFieldFinalized && !isFormallyApproved && record.status === MaintenanceStatus.COMPLETED && isRecentOrFuture) {
    return {
      ...record,
      status: MaintenanceStatus.PRE_COMPLETED,
      routeStatus: MaintenanceStatus.PRE_COMPLETED
    };
  }
  return record;
}

export function normalizeAddressText(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^\w\s]/gi, " ") // remove pontuação
    .replace(/\s+/g, " ")
    .trim();
}

export const dataService = {
  // Route Configurations
  async getRouteConfigs(): Promise<RouteConfiguration[]> {
    return getCachedData('route_configs', async () => {
      try {
        const snapshot = await getDocs(collection(db, COLLECTIONS.ROUTE_CONFIGS));
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RouteConfiguration));
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, COLLECTIONS.ROUTE_CONFIGS);
        return [];
      }
    });
  },

  async upsertRouteConfig(config: RouteConfiguration) {
    try {
      const { id, ...data } = config;
      await setDoc(doc(db, COLLECTIONS.ROUTE_CONFIGS, id), clean({
        ...data,
        updatedAt: serverTimestamp()
      }));
      await historyService.log(id, 'RouteConfiguration', 'Upsert', data);
      clearCache('route_configs');
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, COLLECTIONS.ROUTE_CONFIGS);
    }
  },

  async syncRouteTechnicians(month: string, routeName: string, tech1?: string, tech2?: string) {
    try {
      // 1. Get all addresses for this route
      const addresses = await dataService.getAddresses();
      const routeAddressIds = addresses.filter(a => a.route === routeName).map(a => a.id);
      
      if (routeAddressIds.length === 0) return;

      // 2. Get records for this month and route
      const records = await dataService.getRecords(month);
      const recordsToUpdate = records.filter(r => routeAddressIds.includes(r.addressId));

      // 3. Update them
      const promises = recordsToUpdate.map(r => 
        dataService.upsertRecord({
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
      clearCache('route_configs');
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `${COLLECTIONS.ROUTE_CONFIGS}/${id}`);
    }
  },

  async checkRouteNumberExists(routeNumber: string, excludeRouteId?: string): Promise<{ exists: boolean; existingRouteName?: string }> {
    try {
      const cleanInput = routeNumber.trim().toUpperCase().replace(/^ROTA\s*/i, '');
      if (!cleanInput) return { exists: false };

      const [configs, addresses] = await Promise.all([
        dataService.getRouteConfigs(),
        dataService.getAddresses()
      ]);

      const allKnownRoutes = new Map<string, RouteConfiguration | undefined>();
      configs.forEach(c => allKnownRoutes.set(c.id, c));
      addresses.forEach(a => {
        if (a.route && !allKnownRoutes.has(a.route)) {
          allKnownRoutes.set(a.route, undefined);
        }
      });

      for (const [routeName, config] of allKnownRoutes.entries()) {
        if (excludeRouteId && (routeName === excludeRouteId || config?.id === excludeRouteId)) {
          continue;
        }

        let existingNum = '';
        if (config?.routeNumber && config.routeNumber.trim()) {
          existingNum = config.routeNumber.trim().toUpperCase().replace(/^ROTA\s*/i, '');
        } else if (routeName.includes('-')) {
          existingNum = routeName.split('-')[0].trim().toUpperCase().replace(/^ROTA\s*/i, '');
        } else {
          const match = routeName.match(/^(?:ROTA\s*)?([0-9A-Za-z]+)/i);
          existingNum = match ? match[1].trim().toUpperCase() : routeName.trim().toUpperCase();
        }

        if (!existingNum) continue;

        const isExactMatch = existingNum === cleanInput;
        const isNumericMatch = !isNaN(Number(existingNum)) && !isNaN(Number(cleanInput)) && Number(existingNum) === Number(cleanInput);

        if (isExactMatch || isNumericMatch) {
          return { exists: true, existingRouteName: routeName };
        }
      }

      return { exists: false };
    } catch (e) {
      console.error('Erro ao verificar unicidade do número da rota:', e);
      return { exists: false };
    }
  },

  async getRoutePlannings(month: string): Promise<RouteMonthlyPlanning[]> {
    return getCachedData(`route_plannings_${month}`, async () => {
      try {
        const q = query(
          collection(db, COLLECTIONS.ROUTE_PLANNINGS),
          where('month', '==', month)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RouteMonthlyPlanning));
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, COLLECTIONS.ROUTE_PLANNINGS);
        return [];
      }
    });
  },

  async upsertRoutePlanning(planning: Partial<RouteMonthlyPlanning> & { month: string, routeName: string }) {
    try {
      const safeRouteName = planning.routeName ? planning.routeName.replace(/\//g, '_slash_') : 'default';
      const docId = `${planning.month}_${safeRouteName}`;
      const docRef = doc(db, COLLECTIONS.ROUTE_PLANNINGS, docId);
      await setDoc(docRef, clean({
        ...planning,
        updatedAt: serverTimestamp()
      }), { merge: true });
      await historyService.log(docId, 'RouteMonthlyPlanning', 'Upsert', planning);
      clearCache('route_plannings_');
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, COLLECTIONS.ROUTE_PLANNINGS);
    }
  },

  async deleteRoute(routeName: string) {
    try {
      const batch = writeBatch(db);

      // 1. Unassign from all addresses
      const addresses = await dataService.getAddresses();
      const addressesToUpdate = addresses.filter(a => a.route === routeName);
      
      addressesToUpdate.forEach(addr => {
        batch.update(doc(db, COLLECTIONS.ADDRESSES, addr.id), { route: '' });
      });

      // 2. Unassign or delete temporary records associated with this route name
      // Registros manuais temporários são excluídos; endereços reais apenas têm assignedRoute desatribuído para voltarem à rota original!
      const processedRecordIds = new Set<string>();

      const recordsQuery = query(
        collection(db, COLLECTIONS.RECORDS),
        where('temporaryRouteName', '==', routeName)
      );
      const recordsSnap = await getDocs(recordsQuery);
      recordsSnap.docs.forEach(docSnap => {
        processedRecordIds.add(docSnap.id);
        const data = docSnap.data();
        const isDummyTemp = !data.addressId || String(data.addressId).startsWith('TEMP_ADDR_');
        if (isDummyTemp) {
          batch.delete(docSnap.ref);
        } else {
          batch.update(docSnap.ref, {
            assignedRoute: null,
            temporaryRouteName: null,
            isTemporaryRoute: false,
            originalRoute: null
          });
        }
      });

      const assignedQuery = query(
        collection(db, COLLECTIONS.RECORDS),
        where('assignedRoute', '==', routeName)
      );
      const assignedSnap = await getDocs(assignedQuery);
      assignedSnap.docs.forEach(docSnap => {
        if (!processedRecordIds.has(docSnap.id)) {
          const data = docSnap.data();
          const isDummyTemp = !data.addressId || String(data.addressId).startsWith('TEMP_ADDR_');
          if (isDummyTemp) {
            batch.delete(docSnap.ref);
          } else {
            batch.update(docSnap.ref, {
              assignedRoute: null,
              temporaryRouteName: null,
              isTemporaryRoute: false,
              originalRoute: null
            });
          }
        }
      });

      // 3. Delete Route Configuration
      batch.delete(doc(db, COLLECTIONS.ROUTE_CONFIGS, routeName));
      
      // 4. Delete Route Plannings
      const planningsQuery = query(
        collection(db, COLLECTIONS.ROUTE_PLANNINGS),
        where('routeName', '==', routeName)
      );
      const planningsSnap = await getDocs(planningsQuery);
      planningsSnap.docs.forEach(docSnap => {
        batch.delete(docSnap.ref);
      });

      await batch.commit();
      await historyService.log(routeName, 'Route', 'Delete', { message: `Rota ${routeName} removida por completo`, count: addressesToUpdate.length });
      
      clearCache('route_configs');
      clearCache('addresses_');
      clearCache('records_');
    } catch (e) {
      console.error('Error deleting route:', e);
      throw e;
    }
  },

  async renameRoute(oldName: string, newName: string, newRouteNameStr?: string) {
    try {
      const batch = writeBatch(db);

      // 1. Update all addresses
      const addresses = await dataService.getAddresses();
      const addressesToUpdate = addresses.filter(a => a.route === oldName);
      
      addressesToUpdate.forEach(addr => {
        batch.update(doc(db, COLLECTIONS.ADDRESSES, addr.id), { route: newName });
      });

      // 2. Move Route Configuration (Delete old, set new)
      const configs = await dataService.getRouteConfigs();
      const oldConfig = configs.find(c => c.id === oldName);
      
      if (oldConfig) {
        batch.delete(doc(db, COLLECTIONS.ROUTE_CONFIGS, oldName));
        batch.set(doc(db, COLLECTIONS.ROUTE_CONFIGS, newName), clean({
          ...oldConfig,
          id: newName,
          routeNumber: newName,
          routeName: newRouteNameStr || newName,
          updatedAt: serverTimestamp()
        }));
      }

      // 3. Update Route Plannings
      const planningsQuery = query(
        collection(db, COLLECTIONS.ROUTE_PLANNINGS),
        where('routeName', '==', oldName)
      );
      const planningsSnap = await getDocs(planningsQuery);
      planningsSnap.docs.forEach(docSnap => {
        const data = docSnap.data();
        batch.delete(docSnap.ref);
        const newDocId = `${data.month}_${newName}`;
        batch.set(doc(db, COLLECTIONS.ROUTE_PLANNINGS, newDocId), clean({
          ...data,
          id: newDocId,
          routeName: newName,
          updatedAt: serverTimestamp()
        }));
      });

      // 4. Update Records
      const recordsQuery = query(
        collection(db, COLLECTIONS.RECORDS),
        where('assignedRoute', '==', oldName)
      );
      const recordsSnap = await getDocs(recordsQuery);
      recordsSnap.docs.forEach(docSnap => {
        batch.update(docSnap.ref, { assignedRoute: newName });
      });
      
      const tempRecordsQuery = query(
        collection(db, COLLECTIONS.RECORDS),
        where('temporaryRouteName', '==', oldName)
      );
      const tempRecordsSnap = await getDocs(tempRecordsQuery);
      tempRecordsSnap.docs.forEach(docSnap => {
        batch.update(docSnap.ref, { temporaryRouteName: newName });
      });

      await batch.commit();
      await historyService.log(oldName, 'Route', 'Rename', { from: oldName, to: newName, count: addressesToUpdate.length });
      
      clearCache('route_configs');
      clearCache('addresses_');
      clearCache('records_');
    } catch (e) {
      console.error('Error renaming route:', e);
      throw e;
    }
  },

  // Clients
  async performClientsCleanup() {
    try {
      const q = query(collection(db, COLLECTIONS.CLIENTS), where('status', '==', 'inactive'));
      const snapshot = await getDocs(q);
      const now = Date.now();
      const fortyEightHoursInMillis = 48 * 60 * 60 * 1000;
      
      const deletePromises = snapshot.docs.map(async (docSnap) => {
        const data = docSnap.data();
        let deletedAtMillis = 0;
        if (data.deletedAt) {
          if (data.deletedAt.toMillis) {
            deletedAtMillis = data.deletedAt.toMillis();
          } else if (data.deletedAt.seconds) {
            deletedAtMillis = data.deletedAt.seconds * 1000;
          } else if (typeof data.deletedAt === 'string') {
            deletedAtMillis = new Date(data.deletedAt).getTime();
          } else if (data.deletedAt instanceof Date) {
            deletedAtMillis = data.deletedAt.getTime();
          }
        }
        
        if (deletedAtMillis && (now - deletedAtMillis > fortyEightHoursInMillis)) {
          // Permanently delete the client
          await deleteDoc(doc(db, COLLECTIONS.CLIENTS, docSnap.id));
          // Log permanent deletion
          await historyService.log(docSnap.id, 'Client', 'DeletePermanentAuto', { message: 'Cliente excluído permanentemente após 48 horas de inatividade automática' });
          
          // Also let's delete addresses associated with this client to keep DB clean!
          const addrQuery = query(collection(db, COLLECTIONS.ADDRESSES), where('clientId', '==', docSnap.id));
          const addrSnap = await getDocs(addrQuery);
          const addrDeletePromises = addrSnap.docs.map(addrDoc => deleteDoc(doc(db, COLLECTIONS.ADDRESSES, addrDoc.id)));
          await Promise.all(addrDeletePromises);
        }
      });
      await Promise.all(deletePromises);
    } catch (e) {
      console.error('Error performing inactive clients cleanup:', e);
    }
  },

  async getClients(clientId?: string): Promise<Client[]> {
    const cacheKey = clientId ? `client_${clientId}` : 'clients_all';
    return getCachedData(cacheKey, async () => {
      try {
        // Executa a limpeza de forma assíncrona (não-bloqueante)
        dataService.performClientsCleanup().catch(err => console.error('Erro de limpeza:', err));

        if (clientId) {
          const docRef = doc(db, COLLECTIONS.CLIENTS, clientId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const client = { id: docSnap.id, ...docSnap.data() } as Client;
            if (client.status === 'inactive') {
              return [];
            }
            return [client];
          }
          return [];
        }
        const q = query(collection(db, COLLECTIONS.CLIENTS));
        const snapshot = await getDocs(q);
        const items = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as Client))
          .filter(c => c.status !== 'inactive');

        return items.sort((a, b) => {
          const timeA = a.createdAt?.seconds || 0;
          const timeB = b.createdAt?.seconds || 0;
          return timeB - timeA;
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, COLLECTIONS.CLIENTS);
        return [];
      }
    });
  },

  async getInactiveClients(): Promise<Client[]> {
    return getCachedData('clients_inactive', async () => {
      try {
        const q = query(collection(db, COLLECTIONS.CLIENTS), where('status', '==', 'inactive'));
        const snapshot = await getDocs(q);
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
        return items.sort((a, b) => {
          const timeA = a.deletedAt?.seconds || 0;
          const timeB = b.deletedAt?.seconds || 0;
          return timeB - timeA;
        });
      } catch (e) {
        console.error('Error fetching inactive clients:', e);
        return [];
      }
    });
  },

  async restoreClient(id: string) {
    try {
      await updateDoc(doc(db, COLLECTIONS.CLIENTS, id), {
        status: 'active',
        deletedAt: null
      });
      await historyService.log(id, 'Client', 'Restore', { message: 'Cliente recuperado da lixeira antes do prazo de 48 horas' });
      clearCache('client_');
      clearCache('clients_all');
      clearCache('clients_inactive');
      clearCache('addresses_');
    } catch (e) {
      console.error('Error restoring client:', e);
      throw e;
    }
  },

  async addClient(client: Omit<Client, 'id'>) {
    try {
      const docRef = await addDoc(collection(db, COLLECTIONS.CLIENTS), {
        ...clean(client),
        status: 'active',
        createdAt: serverTimestamp()
      });
      await historyService.log(docRef.id, 'Client', 'Create', client);
      clearCache('client_');
      clearCache('clients_all');
      clearCache('clients_inactive');
      clearCache('addresses_');
      return docRef;
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, COLLECTIONS.CLIENTS);
    }
  },

  async updateClient(id: string, data: Partial<Client>) {
    try {
      await updateDoc(doc(db, COLLECTIONS.CLIENTS, id), clean(data));
      await historyService.log(id, 'Client', 'Update', data);
      clearCache('client_');
      clearCache('clients_all');
      clearCache('clients_inactive');
      clearCache('addresses_');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `${COLLECTIONS.CLIENTS}/${id}`);
    }
  },

  async deleteClient(id: string) {
    try {
      await updateDoc(doc(db, COLLECTIONS.CLIENTS, id), {
        status: 'inactive',
        deletedAt: serverTimestamp()
      });
      await historyService.log(id, 'Client', 'DeleteLogical', { message: 'Cliente movido para a lixeira por 48 horas' });
      clearCache('client_');
      clearCache('clients_all');
      clearCache('clients_inactive');
      clearCache('addresses_');
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `${COLLECTIONS.CLIENTS}/${id}`);
    }
  },

  // Addresses
  async getAddresses(clientId?: string, includeInactive: boolean = false): Promise<Address[]> {
    const cacheKey = clientId 
      ? `addresses_client_${clientId}_${includeInactive ? 'all' : 'active'}` 
      : `addresses_all_${includeInactive ? 'all' : 'active'}`;
    return getCachedData(cacheKey, async () => {
      try {
        let q;
        if (clientId) {
          q = query(collection(db, COLLECTIONS.ADDRESSES), where('clientId', '==', clientId));
        } else {
          q = collection(db, COLLECTIONS.ADDRESSES);
        }
        const snapshot = await getDocs(q);
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as Address));
        
        // Garante que todos os endereços cadastrados sejam retornados,
        // filtrando apenas se o próprio endereço foi explicitamente desativado (quando includeInactive for false)
        const filtered = items.filter(a => {
          if (!includeInactive) {
            if (a.status === 'inactive' || a.active === false || a.isInactive === true) {
              return false;
            }
          }
          return true;
        });

        return filtered.sort((a, b) => {
          const timeA = a.createdAt?.seconds || 0;
          const timeB = b.createdAt?.seconds || 0;
          return timeB - timeA;
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, COLLECTIONS.ADDRESSES);
        return [];
      }
    });
  },

  async getAllAddresses(clientId?: string): Promise<Address[]> {
    return dataService.getAddresses(clientId, true);
  },

  async getAddressById(id: string): Promise<Address | null> {
    try {
      const docRef = doc(db, COLLECTIONS.ADDRESSES, id);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return { id: snap.id, ...(snap.data() as any) } as Address;
      }
      return null;
    } catch (e) {
      console.error('Erro ao buscar endereço por ID:', e);
      return null;
    }
  },

  async toggleAddressStatus(id: string, active: boolean, reason?: string, deactivatedBy?: string) {
    try {
      const now = new Date().toISOString();
      const updates = active ? {
        status: 'active',
        active: true,
        isInactive: false,
        reactivatedAt: now,
        deactivatedAt: null,
        deactivatedReason: null
      } : {
        status: 'inactive',
        active: false,
        isInactive: true,
        deactivatedAt: now,
        deactivatedReason: reason || 'Endereço desabilitado no sistema',
        deactivatedBy: deactivatedBy || 'Administrador'
      };

      await updateDoc(doc(db, COLLECTIONS.ADDRESSES, id), clean(updates));
      await historyService.log(id, 'Address', active ? 'Reactivate' : 'Deactivate', updates);
      clearCache('addresses_');
      return true;
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `${COLLECTIONS.ADDRESSES}/${id}`);
      return false;
    }
  },

  async deactivateAddress(id: string, reason?: string, deactivatedBy?: string) {
    return dataService.toggleAddressStatus(id, false, reason, deactivatedBy);
  },

  async reactivateAddress(id: string) {
    return dataService.toggleAddressStatus(id, true);
  },

  async addAddress(address: Omit<Address, 'id'>) {
    try {
      // VALIDAÇÃO ESTRITA CONTRA DUPLICATAS:
      // Verifica se já existe um endereço idêntico ou equivalente para o mesmo cliente
      const existingAddresses = await dataService.getAddresses();
      const normStreet = normalizeAddressText(address.street || '');
      const normNumber = normalizeAddressText(address.number || '');

      const duplicate = existingAddresses.find(a => {
        if (a.clientId !== address.clientId) return false;
        if (a.status === 'inactive' || a.active === false || a.isInactive === true) return false;
        const existingNormStreet = normalizeAddressText(a.street || '');
        const existingNormNumber = normalizeAddressText(a.number || '');
        return existingNormStreet === normStreet && existingNormNumber === normNumber;
      });

      if (duplicate) {
        throw new Error(`Este endereço já está cadastrado para este cliente: "${duplicate.street}". Para evitar duplicidades no cronograma, não é permitido cadastrar o mesmo endereço duas vezes.`);
      }

      const docRef = await addDoc(collection(db, COLLECTIONS.ADDRESSES), {
        ...clean(address),
        status: address.status || 'active',
        active: address.active !== false,
        isInactive: false,
        createdAt: serverTimestamp()
      });
      await historyService.log(docRef.id, 'Address', 'Create', address);
      
      clearCache('addresses_');

      // Auto-create record for current month
      const currentMonth = format(new Date(), 'yyyy-MM');
      const routeConfigs = await dataService.getRouteConfigs();
      const config = routeConfigs.find(c => c.id === address.route && (c.type === RouteType.FIXED || c.type === RouteType.TEMPORARY));

      await dataService.upsertRecord({
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
      if (data.street || data.clientId) {
        const existingAddresses = await dataService.getAddresses();
        const currentAddr = existingAddresses.find(a => a.id === id);
        const targetClientId = data.clientId || currentAddr?.clientId;
        const normStreet = normalizeAddressText(data.street || currentAddr?.street || '');
        const normNumber = normalizeAddressText(data.number !== undefined ? data.number : (currentAddr?.number || ''));

        const duplicate = existingAddresses.find(a => {
          if (a.id === id) return false;
          if (a.clientId !== targetClientId) return false;
          if (a.status === 'inactive' || a.active === false || a.isInactive === true) return false;
          const existingNormStreet = normalizeAddressText(a.street || '');
          const existingNormNumber = normalizeAddressText(a.number || '');
          return existingNormStreet === normStreet && existingNormNumber === normNumber;
        });

        if (duplicate) {
          throw new Error(`Já existe outro endereço cadastrado para este cliente com esta descrição/rua: "${duplicate.street}". Operação cancelada para evitar duplicidades no cronograma.`);
        }
      }

      await updateDoc(doc(db, COLLECTIONS.ADDRESSES, id), clean(data));
      await historyService.log(id, 'Address', 'Update', data);
      clearCache('addresses_');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `${COLLECTIONS.ADDRESSES}/${id}`);
    }
  },

  async deleteAddress(id: string) {
    try {
      await deleteDoc(doc(db, COLLECTIONS.ADDRESSES, id));
      await historyService.log(id, 'Address', 'Delete', { message: 'Endereço removido' });
      clearCache('addresses_');
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `${COLLECTIONS.ADDRESSES}/${id}`);
    }
  },

  async deduplicateAndMergeAddresses(): Promise<any> {
    try {
      const res = await fetch('/api/maintenance/deduplicate-and-merge-addresses?dryRun=false', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      clearCache('addresses_');
      clearCache('records_');
      clearCache('equipments_');
      return data;
    } catch (e) {
      console.error('Erro ao chamar deduplicação de endereços:', e);
      throw e;
    }
  },

  deduplicateRecordsList(records: MaintenanceRecord[]): { deduplicated: MaintenanceRecord[]; duplicateIds: string[] } {
    return deduplicateRecordsList(records);
  },

  // Maintenance Records
  async getRecordsByYear(year: string): Promise<MaintenanceRecord[]> {
    try {
      const q = query(
        collection(db, COLLECTIONS.RECORDS), 
        where('month', '>=', `${year}-01`),
        where('month', '<=', `${year}-12`)
      );
      const snapshot = await getDocs(q);
      const rawList = snapshot.docs.map(doc => {
        const data = doc.data() as any;
        if (Array.isArray(data.checklist)) {
          data.checklist = data.checklist.map((item: any) => ({
            ...item,
            photos: [] // Higieniza fotos para não sobrecarregar memória na visão anual
          }));
        }
        return { id: doc.id, ...data } as MaintenanceRecord;
      });
      const { deduplicated, duplicateIds } = deduplicateRecordsList(rawList);
      if (duplicateIds.length > 0) {
        dataService.cleanupDuplicateRecordsAsync(duplicateIds);
      }
      return deduplicated;
    } catch (e) {
      console.error('Error fetching records by year:', e);
      return [];
    }
  },

  async getRecords(month: string, options?: { lightweight?: boolean }): Promise<MaintenanceRecord[]> {
    const isLight = options?.lightweight ?? false;
    const cacheKey = isLight ? `records_light_${month}` : `records_${month}`;
    return getCachedData(cacheKey, async () => {
      try {
        const q = query(collection(db, COLLECTIONS.RECORDS), where('month', '==', month));
        const snapshot = await getDocs(q);
        const rawList = snapshot.docs.map(doc => {
          const data = doc.data() as any;
          if (isLight && Array.isArray(data.checklist)) {
            data.checklist = data.checklist.map((item: any) => ({
              ...item,
              photos: [] // Remove base64 pesadas para não estourar memória do cronograma
            }));
          }
          return { id: doc.id, ...data } as MaintenanceRecord;
        });
        const { deduplicated, duplicateIds } = deduplicateRecordsList(rawList);
        if (duplicateIds.length > 0) {
          dataService.cleanupDuplicateRecordsAsync(duplicateIds);
        }
        return deduplicated;
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, COLLECTIONS.RECORDS);
        return [];
      }
    });
  },

  // Consulta ultra-leve para obter apenas os IDs de endereços pendentes de um mês anterior (sem baixar fotos nem travar a tela)
  async getIncompleteAddressIds(month: string): Promise<Set<string>> {
    try {
      const records = await dataService.getRecords(month, { lightweight: true });
      const missing = new Set<string>();
      records.forEach(r => {
        if (r.status !== MaintenanceStatus.COMPLETED && r.addressId) {
          missing.add(r.addressId);
        }
      });
      return missing;
    } catch (e) {
      console.warn('Erro ao carregar endereços pendentes do mês anterior:', e);
      return new Set<string>();
    }
  },

  async getRecordsByPlannedDate(plannedDate: string): Promise<MaintenanceRecord[]> {
    const cacheKey = `records_plannedDate_${plannedDate}`;
    return getCachedData(cacheKey, async () => {
      try {
        const snap = await getDocs(query(collection(db, COLLECTIONS.RECORDS), where('plannedDate', '==', plannedDate)));
        const map = new Map<string, any>();
        snap.docs.forEach((doc: any) => {
          if (!map.has(doc.id)) {
            const data = doc.data() as any;
            if (Array.isArray(data.checklist)) {
              data.checklist = data.checklist.map((item: any) => ({
                ...item,
                photos: [] // Higieniza fotos para tráfego leve no roteiro diário do técnico
              }));
            }
            map.set(doc.id, { id: doc.id, ...data });
          }
        });
        const rawList = Array.from(map.values()) as MaintenanceRecord[];
        const { deduplicated, duplicateIds } = deduplicateRecordsList(rawList);
        if (duplicateIds.length > 0) {
          dataService.cleanupDuplicateRecordsAsync(duplicateIds);
        }
        return deduplicated;
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, COLLECTIONS.RECORDS);
        return [];
      }
    });
  },

  subscribeRecordsByPlannedDate(plannedDate: string, callback: (records: MaintenanceRecord[]) => void): () => void {
    if (!plannedDate) return () => {};
    try {
      const q = query(collection(db, COLLECTIONS.RECORDS), where('plannedDate', '==', plannedDate));
      return onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map(doc => {
          const data = doc.data() as any;
          if (Array.isArray(data.checklist)) {
            data.checklist = data.checklist.map((item: any) => ({
              ...item,
              photos: []
            }));
          }
          return { id: doc.id, ...data } as MaintenanceRecord;
        });
        const { deduplicated } = deduplicateRecordsList(list);
        callback(deduplicated);
      }, (err) => {
        console.warn('[Realtime Listener] Erro em subscribeRecordsByPlannedDate:', err);
      });
    } catch (e) {
      console.warn('[Realtime Listener Setup] Falha:', e);
      return () => {};
    }
  },

  clearCache(prefix?: string) {
    clearCache(prefix);
  },

  async getPreCompletedRecords(): Promise<MaintenanceRecord[]> {
    try {
      const q = query(collection(db, COLLECTIONS.RECORDS), where('status', '==', MaintenanceStatus.PRE_COMPLETED));
      const snapshot = await getDocs(q);
      const rawList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MaintenanceRecord));

      // Também busca atendimentos do mês corrente que possam ter sido gravados como completed sem homologação
      const currentMonth = format(new Date(), 'yyyy-MM');
      const qMonth = query(collection(db, COLLECTIONS.RECORDS), where('month', '==', currentMonth));
      const snapMonth = await getDocs(qMonth);
      const monthDocs = snapMonth.docs.map(doc => ({ id: doc.id, ...doc.data() } as MaintenanceRecord));

      const combined = [...rawList, ...monthDocs];
      const { deduplicated } = deduplicateRecordsList(combined);

      // Apenas registros que realmente aguardam aprovação:
      // Deixe pendente para aprovação SOMENTE os atendimentos de ontem (28/09/2026) e hoje (29/09/2026).
      // REGRA INVIOLÁVEL: OBRIGATÓRIO ter nome, matrícula e assinatura digital para constar em aprovação!
      return deduplicated.filter(r => {
        const rawDate = r.completionDate || r.clientSignatureDate || r.executionDate || r.plannedDate || '';
        const d = typeof rawDate === 'string' ? rawDate.slice(0, 10) : '';
        const isRecent = !d || d >= '2026-09-28';
        if (!isRecent) return false;

        const isApproved = Boolean(r.adminApproved || r.approvedAt || r.approvedBy);
        if (isApproved) return false;

        const hasSignature = Boolean(r.clientSignature && typeof r.clientSignature === 'string' && r.clientSignature.trim().length > 10);
        const hasSignee = Boolean(r.clientSigneeName && typeof r.clientSigneeName === 'string' && r.clientSigneeName.trim().length >= 3);
        const hasRegistration = Boolean(r.clientSigneeRegistration && typeof r.clientSigneeRegistration === 'string' && r.clientSigneeRegistration.trim().length >= 3);
        const isFieldFinalized = hasSignature && hasSignee && hasRegistration;

        // Sem assinatura completa, NUNCA entra na fila de aprovação
        if (!isFieldFinalized) return false;

        return r.status === MaintenanceStatus.PRE_COMPLETED || isFieldFinalized;
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, COLLECTIONS.RECORDS);
      return [];
    }
  },

  async getRecentApprovedRecords(limitCount: number = 30): Promise<MaintenanceRecord[]> {
    try {
      const q = query(
        collection(db, COLLECTIONS.RECORDS),
        where('status', '==', MaintenanceStatus.COMPLETED)
      );
      const snapshot = await getDocs(q);
      const rawList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MaintenanceRecord));
      const { deduplicated } = deduplicateRecordsList(rawList);
      
      // Filtra os atendimentos homologados pelo administrativo.
      // Atendimentos anteriores a ontem já foram aprovados pelo administrativo!
      const records = deduplicated.filter(r => {
        if (r.status !== MaintenanceStatus.COMPLETED) return false;
        const rawDate = r.completionDate || r.clientSignatureDate || r.executionDate || r.plannedDate || '';
        const d = typeof rawDate === 'string' ? rawDate.slice(0, 10) : '';
        if (d && d < '2026-09-28') return true;

        const isFieldFinalized = Boolean(r.clientSignature || r.clientSigneeName || (r.completionDate && typeof r.completionDate === 'string' && r.completionDate.includes('T')));
        if (isFieldFinalized) {
          return Boolean(r.adminApproved || r.approvedAt || r.approvedBy);
        }
        return true;
      });
      
      // Ordenação precisa do mais recente para o mais antigo:
      // Compara completionDate, clientSignatureDate, executionDate, updatedAt, plannedDate, month
      records.sort((a, b) => {
        const timeA = a.completionDate || a.clientSignatureDate || a.executionDate || (a as any).updatedAt || a.plannedDate || a.month || '';
        const timeB = b.completionDate || b.clientSignatureDate || b.executionDate || (b as any).updatedAt || b.plannedDate || b.month || '';
        return String(timeB).localeCompare(String(timeA));
      });

      return records.slice(0, limitCount);
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, COLLECTIONS.RECORDS);
      return [];
    }
  },

  async getAllRecords(): Promise<MaintenanceRecord[]> {
    return getCachedData('records_all', async () => {
      try {
        const snapshot = await getDocs(collection(db, COLLECTIONS.RECORDS));
        const rawList = snapshot.docs.map(doc => {
          const data = doc.data() as any;
          if (Array.isArray(data.checklist)) {
            data.checklist = data.checklist.map((item: any) => ({
              ...item,
              photos: [] // Remove fotos de checklist para economizar memória ao carregar histórico global
            }));
          }
          return { id: doc.id, ...data } as MaintenanceRecord;
        });
        const { deduplicated, duplicateIds } = deduplicateRecordsList(rawList);
        if (duplicateIds.length > 0) {
          dataService.cleanupDuplicateRecordsAsync(duplicateIds);
        }
        return deduplicated;
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, COLLECTIONS.RECORDS);
        return [];
      }
    });
  },

  async getRecordById(id: string): Promise<MaintenanceRecord | null> {
    try {
      const docSnap = await getDoc(doc(db, COLLECTIONS.RECORDS, id));
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as MaintenanceRecord;
      }
      return null;
    } catch (e) {
      console.error('Erro ao buscar registro por ID:', e);
      return null;
    }
  },

  async getRecordsByAddress(addressId: string): Promise<MaintenanceRecord[]> {
    return getCachedData(`records_address_${addressId}`, async () => {
      try {
        const q = query(collection(db, COLLECTIONS.RECORDS), where('addressId', '==', addressId));
        const snapshot = await getDocs(q);
        const rawList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MaintenanceRecord));
        const { deduplicated, duplicateIds } = deduplicateRecordsList(rawList);
        if (duplicateIds.length > 0) {
          dataService.cleanupDuplicateRecordsAsync(duplicateIds);
        }
        // Sort by month descending
        return deduplicated.sort((a,b) => b.month.localeCompare(a.month));
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, COLLECTIONS.RECORDS);
        return [];
      }
    });
  },

  cleanupDuplicateRecordsAsync(duplicateIds: string[]) {
    if (!duplicateIds || duplicateIds.length === 0) return;
    Promise.all(
      duplicateIds.map(id => deleteDoc(doc(db, COLLECTIONS.RECORDS, id)).catch(() => {}))
    ).catch(() => {});
  },

  async sanitizeAllSchedules(): Promise<{ cleaned: number; duplicatesRemoved: number }> {
    try {
      const snap = await getDocs(collection(db, COLLECTIONS.RECORDS));
      const allDocs = snap.docs.map(d => ({ id: d.id, ...d.data() as any, ref: d.ref }));
      let cleaned = 0;
      let duplicatesRemoved = 0;

      for (const d of allDocs) {
        if (Array.isArray(d.plannedDates) || d.returnDate) {
          await updateDoc(d.ref, {
            plannedDates: deleteField(),
            returnDate: deleteField()
          }).catch(() => {});
          cleaned++;
        }
      }

      // Garante unicidade de agendamento por addressId
      const byAddress = new Map<string, typeof allDocs>();
      for (const d of allDocs) {
        if (!d.addressId || d.isTemporaryRoute) continue;
        if (!byAddress.has(d.addressId)) byAddress.set(d.addressId, []);
        byAddress.get(d.addressId)!.push(d);
      }

      for (const [addressId, list] of byAddress.entries()) {
        if (list.length <= 1) continue;
        list.sort((a, b) => {
          const score = (rec: any) => {
            let pts = 0;
            if (rec.status === MaintenanceStatus.COMPLETED) pts += 100;
            if (rec.status === MaintenanceStatus.PRE_COMPLETED) pts += 50;
            if (rec.executionDate) pts += 40;
            if (rec.plannedDate) pts += 20;
            if (rec.technician1) pts += 10;
            if (rec.id.startsWith((rec.month || '') + '_')) pts += 5;
            return pts;
          };
          return score(b) - score(a);
        });

        const best = list[0];
        const duplicates = list.slice(1);
        for (const dup of duplicates) {
          if (dup.status !== MaintenanceStatus.COMPLETED && dup.status !== MaintenanceStatus.PRE_COMPLETED) {
            await deleteDoc(dup.ref).catch(() => {});
            duplicatesRemoved++;
          } else if (dup.plannedDate && best.plannedDate && dup.plannedDate !== best.plannedDate) {
            await updateDoc(dup.ref, { plannedDate: deleteField(), plannedDates: deleteField(), returnDate: deleteField() }).catch(() => {});
            cleaned++;
          }
        }
      }

      clearCache('records_');
      return { cleaned, duplicatesRemoved };
    } catch (e) {
      console.warn('Erro ao higienizar agendamentos:', e);
      return { cleaned: 0, duplicatesRemoved: 0 };
    }
  },

  async upsertRecord(record: Omit<MaintenanceRecord, 'id'> & { id?: string }) {
    try {
      // PADRONIZAÇÃO UNIVERSAL:
      // Para qualquer endereço REAL (não temporário avulso dummy), o ID do documento no Firestore é SEMPRE ${month}_${addressId}.
      // Isso elimina duplicações no banco de dados, permitindo alocar em rota temporária e retornar à original sem duplicar registros.
      const isRealAddress = Boolean(record.addressId && !String(record.addressId).startsWith('TEMP_ADDR_'));
      let docId: string;
      if (isRealAddress && record.month) {
        docId = `${record.month}_${record.addressId}`;
      } else if (record.id) {
        docId = record.id;
      } else if (record.isTemporaryRoute) {
        docId = `temp_${record.month || ''}_${(record.temporaryRouteName || 'rota').trim()}_${(record.temporaryStreet || record.temporaryClient || Date.now()).toString().trim()}`.replace(/\//g, '_');
      } else {
        docId = `${record.month || 'default'}_${record.addressId || Date.now()}`;
      }

      const { id: _, ...data } = record;
      const cleanedData: any = clean({ ...data, id: docId });
      
      // REGRA MANDATÓRIA: Endereços têm estritamente UMA ÚNICA data prevista.
      // Elimina qualquer resquício de múltiplas datas programadas (plannedDates) e returnDate.
      delete cleanedData.plannedDates;
      cleanedData.returnDate = null;
      cleanedData.plannedDates = deleteField();

      // REGRA ABSOLUTA DE NEGÓCIOS DA LE FRIO:
      // Somente o sistema administrativo tem autonomia para aprovar e finalizar formalmente um atendimento preventivo.
      // É IMPOSSÍVEL ter uma folha de atendimento finalizada pelo técnico sem assinatura.
      // O sistema só aceita finalizar o atendimento se tiver preenchido nome do cliente, matrícula e assinatura.
      const hasSignature = Boolean(cleanedData.clientSignature && typeof cleanedData.clientSignature === 'string' && cleanedData.clientSignature.trim().length > 10);
      const hasSignee = Boolean(cleanedData.clientSigneeName && typeof cleanedData.clientSigneeName === 'string' && cleanedData.clientSigneeName.trim().length >= 3);
      const hasRegistration = Boolean(cleanedData.clientSigneeRegistration && typeof cleanedData.clientSigneeRegistration === 'string' && cleanedData.clientSigneeRegistration.trim().length >= 3);
      const isFieldFinalized = hasSignature && hasSignee && hasRegistration;

      const isFormallyApproved = Boolean(cleanedData.adminApproved || cleanedData.approvedAt || cleanedData.approvedBy);
      const recordDate = cleanedData.completionDate || cleanedData.clientSignatureDate || cleanedData.executionDate || cleanedData.plannedDate || '';
      const dateStr = typeof recordDate === 'string' ? recordDate.slice(0, 10) : '';
      const isRecentOrFuture = !dateStr || dateStr >= '2026-09-28';

      // Proteção de Integridade: Um atendimento sem assinatura, nome e matrícula NUNCA pode ter status PRE_COMPLETED ou COMPLETED
      // (a menos que já tenha sido formalmente aprovado e homologado pelo administrativo).
      if (!isFormallyApproved && !isFieldFinalized && (cleanedData.status === MaintenanceStatus.PRE_COMPLETED || (cleanedData.status === MaintenanceStatus.COMPLETED && isRecentOrFuture))) {
        cleanedData.status = MaintenanceStatus.PENDING;
        cleanedData.routeStatus = MaintenanceStatus.PENDING;
        delete cleanedData.completionDate;
      }

      if (isFieldFinalized && !isFormallyApproved && cleanedData.status === MaintenanceStatus.COMPLETED && isRecentOrFuture) {
        cleanedData.status = MaintenanceStatus.PRE_COMPLETED;
        cleanedData.routeStatus = MaintenanceStatus.PRE_COMPLETED;
      }

      const docRef = doc(db, COLLECTIONS.RECORDS, docId);
      await setDoc(docRef, cleanedData, { merge: true });
      await historyService.log(docId, 'MaintenanceRecord', 'Upsert', data);

      // Se o registro possuía anteriormente um ID gerado aleatoriamente e diferente do ID determinístico, remove o legado
      if (record.id && record.id !== docId) {
        await deleteDoc(doc(db, COLLECTIONS.RECORDS, record.id)).catch(() => {});
      }

      // REGRA MANDATÓRIA: Endereços têm estritamente UMA ÚNICA data prevista.
      // Se o endereço tinha uma data anterior agendada e daí recebeu um novo agendamento,
      // ele sai totalmente do agendamento anterior e passa a ficar somente neste novo agendamento.
      if (!record.isTemporaryRoute && record.addressId && cleanedData.plannedDate) {
        try {
          const snap = await getDocs(query(
            collection(db, COLLECTIONS.RECORDS),
            where('addressId', '==', record.addressId)
          ));
          const cleanupPromises = snap.docs.map(async (d: any) => {
            if (d.id !== docId) {
              const dData = d.data() as any;
              // Se é outro registro pendente (agendamento anterior), remove para não haver datas múltiplas nem técnicos concorrentes
              if (dData.status !== MaintenanceStatus.COMPLETED && dData.status !== MaintenanceStatus.PRE_COMPLETED) {
                await deleteDoc(d.ref).catch(() => {});
              } else if (dData.plannedDate) {
                // Se é histórico concluído mas ainda tinha plannedDate preenchida, limpa a plannedDate do histórico
                await updateDoc(d.ref, {
                  plannedDate: deleteField(),
                  plannedDates: deleteField(),
                  returnDate: deleteField()
                }).catch(() => {});
              }
            }
          });
          await Promise.all(cleanupPromises);
        } catch (cleanErr) {
          console.warn("[upsertRecord] Aviso ao limpar agendamentos anteriores do endereço:", cleanErr);
        }
      }

      clearCache('records_');
      return docId;
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, COLLECTIONS.RECORDS);
      return null;
    }
  },

  async deleteRecord(id: string) {
    try {
      await deleteDoc(doc(db, COLLECTIONS.RECORDS, id));
      await historyService.log(id, 'MaintenanceRecord', 'Delete', { message: 'Registro de manutenção removido' });
      clearCache('records_');
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `${COLLECTIONS.RECORDS}/${id}`);
    }
  },

  // Technicians
  async getTechnicians(): Promise<Technician[]> {
    return getCachedData('technicians', async () => {
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
    });
  },

  async addTechnician(name: string, pin?: string) {
    try {
      const docRef = await addDoc(collection(db, COLLECTIONS.TECHNICIANS), { 
         name, 
         pin: pin || '', 
         createdAt: serverTimestamp() 
      });
      await historyService.log(docRef.id, 'Technician', 'Create', { name, pin });
      clearCache('technicians');
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, COLLECTIONS.TECHNICIANS);
    }
  },

  async updateTechnician(id: string, name: string, pin?: string) {
    try {
      await updateDoc(doc(db, COLLECTIONS.TECHNICIANS, id), { 
        name,
        pin: pin || ''
      });
      await historyService.log(id, 'Technician', 'Update', { name, pin });
      clearCache('technicians');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `${COLLECTIONS.TECHNICIANS}/${id}`);
    }
  },

  async updateTechnicianPrice(id: string, pricePerMachine: number) {
    try {
      await updateDoc(doc(db, COLLECTIONS.TECHNICIANS, id), { pricePerMachine });
      await historyService.log(id, 'Technician', 'UpdatePrice', { pricePerMachine });
      clearCache('technicians');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `${COLLECTIONS.TECHNICIANS}/${id}`);
    }
  },

  async updateTechnicianPrices(id: string, prices: { pricePerMachine?: number; serviceOrderPrices?: Record<string, number>; pricePerCorrectiveOS?: number; pricePerJettingOS?: number }) {
    try {
      const updateData: any = {};
      if (prices.pricePerMachine !== undefined) updateData.pricePerMachine = prices.pricePerMachine;
      if (prices.serviceOrderPrices !== undefined) updateData.serviceOrderPrices = prices.serviceOrderPrices;
      if (prices.pricePerCorrectiveOS !== undefined) updateData.pricePerCorrectiveOS = prices.pricePerCorrectiveOS;
      if (prices.pricePerJettingOS !== undefined) updateData.pricePerJettingOS = prices.pricePerJettingOS;

      await updateDoc(doc(db, COLLECTIONS.TECHNICIANS, id), updateData);
      await historyService.log(id, 'Technician', 'UpdatePrices', updateData);
      clearCache('technicians');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `${COLLECTIONS.TECHNICIANS}/${id}`);
    }
  },

  async deleteTechnician(id: string) {
    try {
      await deleteDoc(doc(db, COLLECTIONS.TECHNICIANS, id));
      await historyService.log(id, 'Technician', 'Delete', { message: 'Técnico removido' });
      clearCache('technicians');
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `${COLLECTIONS.TECHNICIANS}/${id}`);
    }
  },

  // Logistics: Generate Monthly Schedule
  async generateMonthSchedule(month: string, prevMonth?: string) {
    try {
      // 1. Get all addresses and clients
      const [addresses, clients] = await Promise.all([
        dataService.getAddresses(),
        dataService.getClients()
      ]);
      if (addresses.length === 0) {
        throw new Error('Nenhum endereço cadastrado. Cadastre endereços antes de gerar o cronograma.');
      }

      // 2. Get existing records for this month (avoid duplicates)
      const existing = await dataService.getRecords(month);
      const existingAddressIds = new Set(existing.map(r => r.addressId));

      // 3. (Optional) Check prevMonth for pending tasks (Carry Over logic)
      let prioritaryIds = new Set<string>();
      if (prevMonth) {
        const prevRecords = await dataService.getRecords(prevMonth);
        prevRecords.forEach(r => {
          if (r.status !== MaintenanceStatus.COMPLETED) {
            prioritaryIds.add(r.addressId);
          }
        });
      }

      // 4. Get route configs to apply fixed technicians
      const routeConfigs = await dataService.getRouteConfigs();

      const batch = [];
      for (const addr of addresses) {
        if (!existingAddressIds.has(addr.id)) {
          const config = routeConfigs.find(c => c.id === addr.route && (c.type === RouteType.FIXED || c.type === RouteType.TEMPORARY));
          const client = clients.find(c => c.id === addr.clientId);
          
          batch.push({
            month,
            addressId: addr.id,
            scheduledWeek: 1, 
            status: MaintenanceStatus.PENDING,
            technician1: config?.technician1 || '',
            technician2: config?.technician2 || '',
            notes: addr.notes || '',
            cycle: client?.contractCycle || 1
          });
        }
      }

      if (batch.length === 0) {
        return 0;
      }

      // PADRONIZAÇÃO UNIVERSAL:
      // Grava em lotes (batch) com o ID determinístico ${month}_${addressId} em 100% das criações
      const { writeBatch, doc } = await import('firebase/firestore');
      const BATCH_SIZE = 450;
      for (let i = 0; i < batch.length; i += BATCH_SIZE) {
        const chunk = batch.slice(i, i + BATCH_SIZE);
        const writeBatchOp = writeBatch(db);
        chunk.forEach(item => {
          const docId = `${item.month}_${item.addressId}`;
          const docRef = doc(db, COLLECTIONS.RECORDS, docId);
          writeBatchOp.set(docRef, clean({ ...item, id: docId }), { merge: true });
        });
        await writeBatchOp.commit();
      }

      clearCache('records_');
      return batch.length;
    } catch (e: any) {
      console.error('Error generating schedule:', e);
      throw e;
    }
  },

  async duplicateSchedule(fromMonth: string, toMonth: string, options: { keepTechnicians: boolean, keepWeeks: boolean }) {
    try {
      const { writeBatch, doc, collection } = await import('firebase/firestore');
      
      const [sourceRecords, existingRecords, activeClients, addresses] = await Promise.all([
        dataService.getRecords(fromMonth),
        dataService.getRecords(toMonth),
        dataService.getClients(),
        dataService.getAddresses()
      ]);

      const existingAddressIds = new Set(existingRecords.map(r => r.addressId));
      const seenSourceAddressIds = new Set<string>();
      const recordsToCreate: MaintenanceRecord[] = [];

      for (const src of sourceRecords) {
        if (!src.addressId) continue;
        // Endereços manuais avulsos da rota temporária NUNCA são duplicados para o novo mês!
        const isDummyTemp = String(src.addressId).startsWith('TEMP_ADDR_');
        if (isDummyTemp) continue;
        if (existingAddressIds.has(src.addressId) || seenSourceAddressIds.has(src.addressId)) continue;
        seenSourceAddressIds.add(src.addressId);
        recordsToCreate.push(src);
      }

      // REGRA: Garante que 100% dos endereços cadastrados sejam programados para o novo mês,
      // mesmo que o endereço não estivesse agendado no mês anterior
      for (const addr of addresses) {
        if (!addr || addr.status === 'inactive' || addr.active === false || addr.isInactive === true) continue;
        if (existingAddressIds.has(addr.id) || seenSourceAddressIds.has(addr.id)) continue;
        seenSourceAddressIds.add(addr.id);
        recordsToCreate.push({
          month: toMonth,
          addressId: addr.id,
          scheduledWeek: 1,
          technician1: '',
          technician2: '',
          status: MaintenanceStatus.PENDING,
          notes: addr.notes || ''
        } as any);
      }
      
      if (recordsToCreate.length === 0) return 0;

      // Firestore batches are limited to 500 operations
      const BATCH_SIZE = 450; 
      let totalCreated = 0;

      for (let i = 0; i < recordsToCreate.length; i += BATCH_SIZE) {
        const chunk = recordsToCreate.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);

        chunk.forEach(src => {
          const addr = addresses.find(a => a.id === src.addressId);
          if (!addr || addr.status === 'inactive' || addr.active === false || addr.isInactive === true) {
            return;
          }
          
          const docId = `${toMonth}_${src.addressId}`;
          const newRecordRef = doc(db, COLLECTIONS.RECORDS, docId);
          const client = activeClients.find(c => c.id === addr.clientId);
          // O ciclo para o novo mês duplicado será o ciclo atual + 1
          const clientCycle = client ? (client.contractCycle || 1) + 1 : 1;

          const newRecord = {
            id: docId,
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
            notes: addr?.notes || (src.notes && src.notes !== 'PRIORIDADE: Pendente do mês anterior' ? src.notes : ''),
            cycle: clientCycle,
            assignedRoute: null,
            temporaryRouteName: null,
            isTemporaryRoute: false,
            originalRoute: null
          };
          batch.set(newRecordRef, clean(newRecord), { merge: true });
        });

        await batch.commit();
        totalCreated += chunk.length;
      }

      // Increment contract cycle and update cycle dates for all active clients
      try {
        if (activeClients.length > 0) {
          const clientBatch = writeBatch(db);
          activeClients.forEach(client => {
            const currentCycle = client.contractCycle || 1;
            const newCycle = currentCycle + 1;
            const clientRef = doc(collection(db, COLLECTIONS.CLIENTS), client.id);
            
            const updates: any = { contractCycle: newCycle };
            
            let monthsToAdd = 1;
            if (client.cyclePeriod === 'bimonthly') monthsToAdd = 2;
            else if (client.cyclePeriod === 'quarterly') monthsToAdd = 3;
            
            if (client.cycleMonth) {
              try {
                const parts = client.cycleMonth.split('-');
                if (parts.length === 2) {
                  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
                  d.setMonth(d.getMonth() + monthsToAdd);
                  const y = d.getFullYear();
                  const m = String(d.getMonth() + 1).padStart(2, '0');
                  updates.cycleMonth = `${y}-${m}`;
                }
              } catch (e) {
                console.error('Error auto-incrementing cycleMonth:', e);
              }
            }

            if (client.cycleStartDate) {
              try {
                const parts = client.cycleStartDate.split('-');
                if (parts.length === 3) {
                  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                  d.setMonth(d.getMonth() + monthsToAdd);
                  const y = d.getFullYear();
                  const m = String(d.getMonth() + 1).padStart(2, '0');
                  const day = String(d.getDate()).padStart(2, '0');
                  updates.cycleStartDate = `${y}-${m}-${day}`;
                }
              } catch (e) {
                console.error('Error auto-incrementing cycleStartDate:', e);
              }
            }
            
            if (client.cycleEndDate) {
              try {
                const parts = client.cycleEndDate.split('-');
                if (parts.length === 3) {
                  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                  d.setMonth(d.getMonth() + monthsToAdd);
                  const y = d.getFullYear();
                  const m = String(d.getMonth() + 1).padStart(2, '0');
                  const day = String(d.getDate()).padStart(2, '0');
                  updates.cycleEndDate = `${y}-${m}-${day}`;
                }
              } catch (e) {
                console.error('Error auto-incrementing cycleEndDate:', e);
              }
            }

            clientBatch.update(clientRef, updates);
          });
          await clientBatch.commit();
          console.log(`Incremented contract cycles and dates for ${activeClients.length} clients.`);
        }
      } catch (err) {
        console.error('Error incrementing client contract cycles on duplication:', err);
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
  async getServiceCalls(clientId?: string): Promise<ServiceCall[]> {
    const cacheKey = clientId ? `service_calls_client_${clientId}` : 'service_calls_all';
    return getCachedData(cacheKey, async () => {
      try {
        let q;
        if (clientId) {
          q = query(
            collection(db, COLLECTIONS.SERVICE_CALLS),
            where('clientId', '==', clientId),
            orderBy('createdAt', 'desc')
          );
        } else {
          q = query(collection(db, COLLECTIONS.SERVICE_CALLS), orderBy('createdAt', 'desc'));
        }
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as ServiceCall));
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, COLLECTIONS.SERVICE_CALLS);
        return [];
      }
    });
  },

  async addServiceCall(call: Omit<ServiceCall, 'id'>) {
    try {
      const docRef = await addDoc(collection(db, COLLECTIONS.SERVICE_CALLS), {
        ...call,
        createdAt: serverTimestamp()
      });
      await historyService.log(docRef.id, 'ServiceCall', 'Create', call);
      clearCache('service_calls_');
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
      clearCache('service_calls_');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `${COLLECTIONS.SERVICE_CALLS}/${id}`);
    }
  },

  async deleteServiceCall(id: string) {
    try {
      await deleteDoc(doc(db, COLLECTIONS.SERVICE_CALLS, id));
      await historyService.log(id, 'ServiceCall', 'Delete', { message: 'Chamado removido' });
      clearCache('service_calls_');
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `${COLLECTIONS.SERVICE_CALLS}/${id}`);
    }
  },

  // Adjustments (Bonuses & Penalties)
  async getAdjustments(technicianName: string, month: string): Promise<Adjustment[]> {
    try {
      const q = query(
        collection(db, COLLECTIONS.ADJUSTMENTS),
        where('technicianName', '==', technicianName),
        where('month', '==', month)
      );
      const snapshot = await getDocs(q);
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Adjustment));
      return items.sort((a, b) => {
        const timeA = new Date(a.createdAt || 0).getTime();
        const timeB = new Date(b.createdAt || 0).getTime();
        return timeA - timeB;
      });
    } catch (e) {
      console.error('Error fetching adjustments:', e);
      return [];
    }
  },

  async addAdjustment(adjustment: Omit<Adjustment, 'id'>) {
    try {
      const docRef = await addDoc(collection(db, COLLECTIONS.ADJUSTMENTS), {
        ...adjustment,
        createdAt: new Date().toISOString()
      });
      return { id: docRef.id, ...adjustment };
    } catch (e) {
      console.error('Error adding adjustment:', e);
      throw e;
    }
  },

  async deleteAdjustment(id: string) {
    try {
      await deleteDoc(doc(db, COLLECTIONS.ADJUSTMENTS, id));
    } catch (e) {
      console.error('Error deleting adjustment:', e);
      throw e;
    }
  },

  // User Profiles & Preferences
  async updateUserProfile(uid: string, data: Partial<UserProfile>) {
    try {
      const docRef = doc(db, COLLECTIONS.USERS, uid);
      await updateDoc(docRef, clean(data));
    } catch (e) {
      console.error('Error updating user profile:', e);
      throw e;
    }
  },

  // Notifications
  async getNotifications(userId: string): Promise<NotificationItem[]> {
    try {
      const q = query(
        collection(db, COLLECTIONS.NOTIFICATIONS),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as NotificationItem));
    } catch (e) {
      console.error('Error fetching notifications:', e);
      return [];
    }
  },

  subscribeNotifications(userId: string, callback: (notifications: NotificationItem[]) => void) {
    const q = query(
      collection(db, COLLECTIONS.NOTIFICATIONS),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as NotificationItem));
      callback(items);
    }, (error) => {
      console.error('Error in notifications subscription:', error);
    });
  },

  async markNotificationAsRead(id: string) {
    try {
      await updateDoc(doc(db, COLLECTIONS.NOTIFICATIONS, id), { read: true });
    } catch (e) {
      console.error('Error marking notification as read:', e);
    }
  },

  async deleteNotification(id: string) {
    try {
      await deleteDoc(doc(db, COLLECTIONS.NOTIFICATIONS, id));
    } catch (e) {
      console.error('Error deleting notification:', e);
    }
  },

  async sendDeviceNotification(
    type: 'tech_start' | 'tech_finish',
    title: string,
    content: string,
    recordId?: string
  ) {
    try {
      // 1. Fetch all users from database
      const usersSnapshot = await getDocs(collection(db, COLLECTIONS.USERS));
      const users = usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));

      // 2. Filter users with administrative or support roles
      const adminUsers = users.filter(u => 
        u.role === UserRole.ADMIN || 
        u.role === UserRole.SUPPORT || 
        u.role === UserRole.ASSISTANT
      );

      // 3. Add notification for each user
      const promises = adminUsers.map(u => 
        addDoc(collection(db, COLLECTIONS.NOTIFICATIONS), {
          userId: u.uid,
          title,
          content,
          type,
          recordId: recordId || '',
          read: false,
          createdAt: serverTimestamp()
        })
      );
      await Promise.all(promises);
    } catch (e) {
      console.error('Error sending device notification:', e);
    }
  },

  async sendNotificationToAllAllowed(
    type: 'new_call' | 'new_comment' | 'call_resolved',
    title: string,
    content: string,
    callId: string,
    senderUid: string
  ) {
    try {
      // 1. Fetch all users from database
      const usersSnapshot = await getDocs(collection(db, COLLECTIONS.USERS));
      const users = usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));

      // 2. Iterate and create a notification document in the database for each matching user
      const promises = users.map(async (u) => {
        // Skip the sender of the trigger action
        if (u.uid === senderUid) return;

        // Default preferences: enabled if not explicitly disabled
        const prefs = u.notificationPreferences || {
          notifyNewCall: true,
          notifyNewComment: true,
          notifyCallResolved: true
        };

        let shouldNotify = false;
        if (type === 'new_call' && prefs.notifyNewCall !== false) shouldNotify = true;
        if (type === 'new_comment' && prefs.notifyNewComment !== false) shouldNotify = true;
        if (type === 'call_resolved' && prefs.notifyCallResolved !== false) shouldNotify = true;

        if (shouldNotify) {
          await addDoc(collection(db, COLLECTIONS.NOTIFICATIONS), {
            userId: u.uid,
            title,
            content,
            type,
            callId,
            read: false,
            createdAt: serverTimestamp()
          });
        }
      });

      await Promise.all(promises);
    } catch (e) {
      console.error('Error sending preference-based notifications:', e);
    }
  },

  async sendTaskNotification(
    type: 'task_assigned' | 'task_comment' | 'task_attachment',
    title: string,
    content: string,
    taskId: string,
    recipientUids: string[],
    senderUid: string
  ) {
    try {
      const usersSnapshot = await getDocs(collection(db, COLLECTIONS.USERS));
      const users = usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));

      const promises = recipientUids.map(async (uid) => {
        if (uid === senderUid) return;

        const u = users.find(user => user.uid === uid);
        const prefs = u?.notificationPreferences || {
          notifyTaskAssigned: true,
          notifyTaskComment: true,
          notifyTaskAttachment: true
        };

        let shouldNotify = false;
        if (type === 'task_assigned' && prefs.notifyTaskAssigned !== false) shouldNotify = true;
        if (type === 'task_comment' && prefs.notifyTaskComment !== false) shouldNotify = true;
        if (type === 'task_attachment' && prefs.notifyTaskAttachment !== false) shouldNotify = true;

        if (shouldNotify) {
          await addDoc(collection(db, COLLECTIONS.NOTIFICATIONS), {
            userId: uid,
            title,
            content,
            type,
            taskId,
            read: false,
            createdAt: serverTimestamp()
          });
        }
      });
      await Promise.all(promises);
    } catch (e) {
      console.error('Error sending task notification:', e);
    }
  },

  // Tasks (Gestão de Tarefas)
  async getTasks(): Promise<Task[]> {
    return getCachedData('tasks_all', async () => {
      try {
        const q = query(collection(db, COLLECTIONS.TASKS), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as unknown as Task));
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, COLLECTIONS.TASKS);
        return [];
      }
    });
  },

  async addTask(task: Omit<Task, 'id' | 'createdAt'>) {
    try {
      const cleanedTask = clean(task);
      const docRef = await addDoc(collection(db, COLLECTIONS.TASKS), {
        ...cleanedTask,
        createdAt: serverTimestamp()
      });
      await historyService.log(docRef.id, 'Task', 'Create', cleanedTask);
      clearCache('tasks_all');
      return docRef.id;
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, COLLECTIONS.TASKS);
      return null;
    }
  },

  async updateTask(id: string, data: Partial<Task>) {
    try {
      await updateDoc(doc(db, COLLECTIONS.TASKS, id), {
        ...clean(data),
        updatedAt: serverTimestamp()
      });
      await historyService.log(id, 'Task', 'Update', data);
      clearCache('tasks_all');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `${COLLECTIONS.TASKS}/${id}`);
    }
  },

  async deleteTask(id: string) {
    try {
      await deleteDoc(doc(db, COLLECTIONS.TASKS, id));
      await historyService.log(id, 'Task', 'Delete', { message: 'Tarefa excluída' });
      clearCache('tasks_all');
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `${COLLECTIONS.TASKS}/${id}`);
    }
  },

  async getUsers(): Promise<UserProfile[]> {
    try {
      const snapshot = await getDocs(collection(db, COLLECTIONS.USERS));
      return snapshot.docs.map(doc => {
        const data = doc.data() as any;
        return {
          uid: doc.id,
          ...data,
          name: data.name || data.displayName || data.email?.split('@')[0] || 'Usuário Sem Nome'
        } as UserProfile;
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, COLLECTIONS.USERS);
      return [];
    }
  },

  async getDeviceSettings(): Promise<DeviceSettings> {
    return getCachedData('device_settings', async () => {
      try {
        const docRef = doc(db, 'settings', 'device');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          return { id: docSnap.id, ...docSnap.data() } as DeviceSettings;
        }
        return {
          shortcutText: 'Atendimento',
          expirationDays: 30,
          startTriggerEnabled: false,
          finishTriggerEnabled: false,
          notifiedTechnicians: []
        };
      } catch (e) {
        console.error('Error fetching device settings:', e);
        return {
          shortcutText: 'Atendimento',
          expirationDays: 30,
          startTriggerEnabled: false,
          finishTriggerEnabled: false,
          notifiedTechnicians: []
        };
      }
    });
  },

  async updateDeviceSettings(settings: Partial<DeviceSettings>) {
    try {
      const docRef = doc(db, 'settings', 'device');
      await setDoc(docRef, clean(settings), { merge: true });
      await historyService.log('device-settings', 'Settings', 'Update', settings);
      clearCache('device_settings');
    } catch (e) {
      console.error('Error updating device settings:', e);
      throw e;
    }
  },

  getCompanySettingsSync(companyId?: string): ServiceCompanyConfig | null {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('cached_service_order_settings') : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.companies && Array.isArray(parsed.companies)) {
          if (!companyId) return parsed.companies[0] || null;
          const search = companyId.trim().toLowerCase();
          const found = parsed.companies.find((c: ServiceCompanyConfig) => 
            c.id?.toLowerCase() === search ||
            c.shortName?.toLowerCase()?.includes(search) ||
            c.fullName?.toLowerCase()?.includes(search) ||
            (search === 'alclima' && (c.id?.includes('alclima') || c.shortName?.toLowerCase()?.includes('clima'))) ||
            (search === 'lefrio' && (c.id?.includes('lefrio') || c.shortName?.toLowerCase()?.includes('frio') || c.shortName?.toLowerCase()?.includes('jr')))
          );
          if (found) return found;
        }
      }
    } catch (e) {}
    return null;
  },

  async getServiceOrderSettings(): Promise<ServiceOrderSettings> {
    return getCachedData('service_order_settings', async () => {
      try {
        const docRef = doc(db, 'settings', 'service_orders');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as ServiceOrderSettings;
          let types = data.maintenanceTypes || [];
          if (!types.includes('JATEAMENTO')) {
            types = [...types, 'JATEAMENTO'];
            // Atualiza de forma assíncrona no Firestore para persistir a nova opção
            updateDoc(docRef, { maintenanceTypes: types }).catch(err => console.error('Erro ao atualizar tipos de O.S.:', err));
          }
          const fullSettings = { id: docSnap.id, ...data, maintenanceTypes: types } as ServiceOrderSettings;
          try {
            if (typeof window !== 'undefined') {
              localStorage.setItem('cached_service_order_settings', JSON.stringify(fullSettings));
            }
          } catch (e) {}
          return fullSettings;
        }
        
        const defaultSettings: Omit<ServiceOrderSettings, 'id'> = {
          maintenanceTypes: [
            'MANUTENCAO CORRETIVA CONTRATO',
            'MANUTENCAO PREVENTIVA',
            'JATEAMENTO',
            'INSTALACAO',
            'AVALIAÇÃO TÉCNICA'
          ],
          companies: [
            {
              id: 'lefrio',
              shortName: 'JR COMÉRCIO E SERVIÇOS (LEFRIO)',
              fullName: 'JR COMERCIO E SERVICOS DE CLIMATIZACAO LTDA',
              cnpj: '22.731.413/0002-60',
              ie: '247308110',
              im: '901424174',
              address: 'RUA DR. ELISIO ALVES PEROBA, 103 - ANTARES - MACEIO - AL',
              email: 'atendimentomaceio@lefrio.com.br',
              phone: '(82) 3221-1031'
            },
            {
              id: 'alclima',
              shortName: 'AL CLIMA REFRIGERAÇÃO',
              fullName: 'AL CLIMA REFRIGERACAO LTDA',
              cnpj: '45.123.456/0001-99',
              ie: '247308110',
              im: '901424174',
              address: 'RUA ELISIO ALVES PEROBA, 103 - ANTARES - MACEIO - AL',
              email: 'atendimentomaceio@lefrio.com.br',
              phone: '(82) 3221-1031'
            }
          ]
        };
        
        await setDoc(docRef, clean(defaultSettings));
        const res = { id: 'service_orders', ...defaultSettings } as ServiceOrderSettings;
        try {
          if (typeof window !== 'undefined') {
            localStorage.setItem('cached_service_order_settings', JSON.stringify(res));
          }
        } catch (e) {}
        return res;
      } catch (e) {
        console.error('Error fetching service order settings:', e);
        const fallback = {
          id: 'service_orders',
          maintenanceTypes: [
            'MANUTENCAO CORRETIVA CONTRATO',
            'MANUTENCAO PREVENTIVA',
            'JATEAMENTO',
            'INSTALACAO',
            'AVALIAÇÃO TÉCNICA'
          ],
          companies: [
            {
              id: 'lefrio',
              shortName: 'JR COMÉRCIO E SERVIÇOS (LEFRIO)',
              fullName: 'JR COMERCIO E SERVICOS DE CLIMATIZACAO LTDA',
              cnpj: '22.731.413/0002-60',
              ie: '247308110',
              im: '901424174',
              address: 'RUA DR. ELISIO ALVES PEROBA, 103 - ANTARES - MACEIO - AL',
              email: 'atendimentomaceio@lefrio.com.br',
              phone: '(82) 3221-1031'
            },
            {
              id: 'alclima',
              shortName: 'AL CLIMA REFRIGERAÇÃO',
              fullName: 'AL CLIMA REFRIGERACAO LTDA',
              cnpj: '45.123.456/0001-99',
              ie: '247308110',
              im: '901424174',
              address: 'RUA ELISIO ALVES PEROBA, 103 - ANTARES - MACEIO - AL',
              email: 'atendimentomaceio@lefrio.com.br',
              phone: '(82) 3221-1031'
            }
          ]
        };
        try {
          if (typeof window !== 'undefined' && !localStorage.getItem('cached_service_order_settings')) {
            localStorage.setItem('cached_service_order_settings', JSON.stringify(fallback));
          }
        } catch (e2) {}
        return fallback;
      }
    });
  },

  async updateServiceOrderSettings(settings: Partial<ServiceOrderSettings>) {
    try {
      const docRef = doc(db, 'settings', 'service_orders');
      await setDoc(docRef, clean(settings), { merge: true });
      await historyService.log('service-order-settings', 'Settings', 'Update', settings);
      clearCache('service_order_settings');
      try {
        if (typeof window !== 'undefined') {
          const current = localStorage.getItem('cached_service_order_settings');
          const merged = current ? { ...JSON.parse(current), ...settings } : settings;
          localStorage.setItem('cached_service_order_settings', JSON.stringify(merged));
        }
      } catch (e) {}
    } catch (e) {
      console.error('Error updating service order settings:', e);
      throw e;
    }
  },

  // Mural de Postagens (Mural de comunicação de rotas)
  async getMuralPosts(month: string): Promise<MuralPost[]> {
    try {
      const q = query(collection(db, COLLECTIONS.MURAL_POSTS), where('month', '==', month));
      const snapshot = await getDocs(q);
      const posts = snapshot.docs.map(doc => {
        const data = doc.data() as any;
        return { id: doc.id, ...data } as unknown as MuralPost;
      });
      return posts.sort((a, b) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, COLLECTIONS.MURAL_POSTS);
      return [];
    }
  },

  async addMuralPost(post: Omit<MuralPost, 'id' | 'createdAt'>) {
    try {
      const cleanedPost = clean(post);
      const docRef = await addDoc(collection(db, COLLECTIONS.MURAL_POSTS), {
        ...cleanedPost,
        createdAt: serverTimestamp()
      });
      await historyService.log(docRef.id, 'MuralPost', 'Create', cleanedPost);
      return docRef.id;
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, COLLECTIONS.MURAL_POSTS);
      return null;
    }
  },

  async deleteMuralPost(id: string) {
    try {
      await deleteDoc(doc(db, COLLECTIONS.MURAL_POSTS, id));
      await historyService.log(id, 'MuralPost', 'Delete', { message: 'Mensagem excluída do mural de comunicações' });
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `${COLLECTIONS.MURAL_POSTS}/${id}`);
    }
  },

  // Inspections
  async getInspections(month?: string): Promise<Inspection[]> {
    try {
      let q = query(collection(db, COLLECTIONS.INSPECTIONS));
      if (month) {
        q = query(collection(db, COLLECTIONS.INSPECTIONS), where('month', '==', month));
      }
      const snapshot = await getDocs(q);
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Inspection));
      return items.sort((a, b) => {
        const timeA = a.assignedAt?.seconds || 0;
        const timeB = b.assignedAt?.seconds || 0;
        return timeB - timeA;
      });
    } catch (e) {
      console.error('Error fetching inspections:', e);
      return [];
    }
  },

  async createInspection(inspection: Omit<Inspection, 'id' | 'assignedAt'>) {
    try {
      const cleaned = clean(inspection);
      const docRef = await addDoc(collection(db, COLLECTIONS.INSPECTIONS), {
        ...cleaned,
        assignedAt: serverTimestamp()
      });
      await historyService.log(docRef.id, 'Inspection', 'Create', cleaned);
      return docRef.id;
    } catch (e) {
      console.error('Error creating inspection:', e);
      throw e;
    }
  },

  async updateInspection(id: string, updates: Partial<Inspection>) {
    try {
      const cleaned = clean(updates);
      await updateDoc(doc(db, COLLECTIONS.INSPECTIONS, id), cleaned);
      await historyService.log(id, 'Inspection', 'Update', cleaned);
    } catch (e) {
      console.error('Error updating inspection:', e);
    }
  },

  async deleteInspection(id: string) {
    try {
      await deleteDoc(doc(db, COLLECTIONS.INSPECTIONS, id));
      await historyService.log(id, 'Inspection', 'Delete', { message: 'Fiscalização removida' });
    } catch (e) {
      console.error('Error deleting inspection:', e);
    }
  },

  // Travel Cards
  async getTravelCards(): Promise<TravelCard[]> {
    try {
      const snapshot = await getDocs(collection(db, COLLECTIONS.TRAVEL_CARDS));
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TravelCard));
      return items.sort((a, b) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, COLLECTIONS.TRAVEL_CARDS);
      return [];
    }
  },

  async addTravelCard(card: Omit<TravelCard, 'id'>) {
    try {
      const docRef = await addDoc(collection(db, COLLECTIONS.TRAVEL_CARDS), {
        ...clean(card),
        createdAt: serverTimestamp()
      });
      await historyService.log(docRef.id, 'TravelCard', 'Create', card);
      return docRef;
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, COLLECTIONS.TRAVEL_CARDS);
    }
  },

  async updateTravelCard(id: string, data: Partial<TravelCard>) {
    try {
      await updateDoc(doc(db, COLLECTIONS.TRAVEL_CARDS, id), clean(data));
      await historyService.log(id, 'TravelCard', 'Update', data);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `${COLLECTIONS.TRAVEL_CARDS}/${id}`);
    }
  },

  async deleteTravelCard(id: string) {
    try {
      await deleteDoc(doc(db, COLLECTIONS.TRAVEL_CARDS, id));
      await historyService.log(id, 'TravelCard', 'Delete', { id });
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `${COLLECTIONS.TRAVEL_CARDS}/${id}`);
    }
  },

  // Contract Performance Analysis
  async getContractsPerformance(): Promise<ContractPerformance[]> {
    try {
      const snapshot = await getDocs(collection(db, COLLECTIONS.CONTRACT_PERFORMANCE));
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ContractPerformance));
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, COLLECTIONS.CONTRACT_PERFORMANCE);
      return [];
    }
  },

  async addContractPerformance(perf: Omit<ContractPerformance, 'id'>) {
    try {
      const docRef = await addDoc(collection(db, COLLECTIONS.CONTRACT_PERFORMANCE), {
        ...clean(perf),
        createdAt: serverTimestamp()
      });
      await historyService.log(docRef.id, 'ContractPerformance', 'Create', perf);
      return docRef;
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, COLLECTIONS.CONTRACT_PERFORMANCE);
    }
  },

  async updateContractPerformance(id: string, data: Partial<ContractPerformance>) {
    try {
      await updateDoc(doc(db, COLLECTIONS.CONTRACT_PERFORMANCE, id), {
        ...clean(data),
        updatedAt: serverTimestamp()
      });
      await historyService.log(id, 'ContractPerformance', 'Update', data);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `${COLLECTIONS.CONTRACT_PERFORMANCE}/${id}`);
    }
  },

  async deleteContractPerformance(id: string) {
    try {
      await deleteDoc(doc(db, COLLECTIONS.CONTRACT_PERFORMANCE, id));
      await historyService.log(id, 'ContractPerformance', 'Delete', { id });
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `${COLLECTIONS.CONTRACT_PERFORMANCE}/${id}`);
    }
  },

  // Equipments
  async getEquipments(addressId?: string, includeDeactivated: boolean = false): Promise<Equipment[]> {
    const cacheKey = addressId 
      ? `equipments_address_${addressId}_${includeDeactivated ? 'all' : 'active'}` 
      : `equipments_all_${includeDeactivated ? 'all' : 'active'}`;
    return getCachedData(cacheKey, async () => {
      try {
        // 1. Tenta buscar pelo endpoint otimizado do backend (instantâneo, sem timeout e protegido)
        try {
          const params = new URLSearchParams();
          if (addressId) params.append('addressId', addressId);
          if (includeDeactivated) params.append('includeDeactivated', 'true');
          const res = await fetch(`/api/equipments?${params.toString()}`);
          if (res.ok) {
            const data = await res.json();
            if (data?.success && Array.isArray(data.equipments)) {
              return data.equipments as Equipment[];
            }
          }
        } catch (apiErr) {
          console.warn('[getEquipments] API indisponível, usando fallback Firestore:', apiErr);
        }

        // 2. Fallback direto ao Firestore
        let q;
        if (addressId) {
          q = query(collection(db, COLLECTIONS.EQUIPMENTS), where('addressId', '==', addressId));
        } else {
          q = collection(db, COLLECTIONS.EQUIPMENTS);
        }
        const snapshot = await getDocs(q);
        let items = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as Equipment));
        
        if (!includeDeactivated) {
          items = items.filter(eq => eq.status !== 'deactivated' && eq.active !== false && !eq.isDeactivated);
        }

        return items.sort((a, b) => {
          const labelA = parseInt(a.label, 10) || 0;
          const labelB = parseInt(b.label, 10) || 0;
          if (labelA !== labelB) {
            return labelA - labelB;
          }
          return a.id.localeCompare(b.id);
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, COLLECTIONS.EQUIPMENTS);
        return [];
      }
    });
  },

  async getDeactivatedEquipments(): Promise<Equipment[]> {
    const cacheKey = 'equipments_deactivated_all';
    return getCachedData(cacheKey, async () => {
      try {
        const snapshot = await getDocs(collection(db, COLLECTIONS.EQUIPMENTS));
        const items = snapshot.docs
          .map(doc => ({ id: doc.id, ...(doc.data() as any) } as Equipment))
          .filter(eq => eq.status === 'deactivated' || eq.active === false || eq.isDeactivated === true);
        
        return items.sort((a, b) => {
          const dateA = a.deactivatedAt ? new Date(a.deactivatedAt).getTime() : 0;
          const dateB = b.deactivatedAt ? new Date(b.deactivatedAt).getTime() : 0;
          return dateB - dateA;
        });
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, COLLECTIONS.EQUIPMENTS);
        return [];
      }
    });
  },

  async addEquipment(equipment: Omit<Equipment, 'id'>) {
    try {
      // OTIMIZAÇÃO: Tenta encontrar o ID sequencial máximo usando o cache em memória local primeiro,
      // economizando até milhares de leituras do Firestore em bancos de dados grandes!
      let maxNum = 0;
      const cached = memoryCache['equipments_all_active'] || memoryCache['equipments_all_all'];
      if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        const list = cached.data as Equipment[];
        list.forEach(eq => {
          const num = parseInt(eq.id, 10);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        });
      } else {
        const allSnapshot = await getDocs(collection(db, COLLECTIONS.EQUIPMENTS));
        allSnapshot.docs.forEach(doc => {
          const num = parseInt(doc.id, 10);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        });
      }
      const nextId = (maxNum + 1).toString().padStart(4, '0');

      const payload = {
        ...clean(equipment),
        id: nextId,
        status: equipment.status || 'active',
        active: equipment.active !== undefined ? equipment.active : true,
        isDeactivated: false,
        createdAt: serverTimestamp()
      };

      await setDoc(doc(db, COLLECTIONS.EQUIPMENTS, nextId), payload);
      await historyService.log(nextId, 'Equipment', 'Create', equipment);
      
      clearCache('equipments_');

      // Máquinas adicionadas em campo por técnicos em caráter pendente NÃO alteram o contrato oficial antes da homologação
      if (!equipment.addedByTech && !equipment.isPendingApproval) {
        await dataService.syncAddressMachinesCount(equipment.addressId);
      }

      return nextId;
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, COLLECTIONS.EQUIPMENTS);
      return null;
    }
  },

  async updateEquipment(id: string, data: Partial<Equipment>) {
    try {
      await updateDoc(doc(db, COLLECTIONS.EQUIPMENTS, id), clean(data));
      await historyService.log(id, 'Equipment', 'Update', data);
      
      clearCache('equipments_');

      if (data.addressId) {
        await dataService.syncAddressMachinesCount(data.addressId);
      } else {
        const eqDoc = await getDoc(doc(db, COLLECTIONS.EQUIPMENTS, id));
        if (eqDoc.exists()) {
          const eqData = eqDoc.data();
          if (eqData?.addressId) {
            await dataService.syncAddressMachinesCount(eqData.addressId);
          }
        }
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `${COLLECTIONS.EQUIPMENTS}/${id}`);
    }
  },

  // Inativação Segura (Soft-Deactivation) para preservar histórico e auditoria
  async deactivateEquipment(id: string, reason?: string, deactivatedBy?: string, recordId?: string) {
    try {
      const eqDoc = await getDoc(doc(db, COLLECTIONS.EQUIPMENTS, id));
      let addressId = '';
      let addressStreet = '';
      let clientName = '';

      if (eqDoc.exists()) {
        const eqData = eqDoc.data();
        addressId = eqData?.addressId || '';
        if (addressId) {
          const addrDoc = await getDoc(doc(db, COLLECTIONS.ADDRESSES, addressId));
          if (addrDoc.exists()) {
            const addrData = addrDoc.data();
            addressStreet = addrData?.street || '';
            if (addrData?.clientId) {
              const cliDoc = await getDoc(doc(db, COLLECTIONS.CLIENTS, addrData.clientId));
              if (cliDoc.exists()) {
                clientName = cliDoc.data()?.name || '';
              }
            }
          }
        }
      }

      const deactivationData: Partial<Equipment> = {
        status: 'deactivated',
        active: false,
        isDeactivated: true,
        deactivatedAt: new Date().toISOString(),
        deactivatedReason: reason || 'Máquina descontinuada / removida no atendimento',
        deactivatedBy: deactivatedBy || 'Setor Administrativo',
        deactivatedFromRecordId: recordId || undefined,
        deactivatedAddressName: addressStreet || undefined,
        deactivatedClientName: clientName || undefined
      };

      await updateDoc(doc(db, COLLECTIONS.EQUIPMENTS, id), clean(deactivationData));
      await historyService.log(id, 'Equipment', 'Deactivate', deactivationData);
      
      clearCache('equipments_');

      if (addressId) {
        await dataService.syncAddressMachinesCount(addressId);
      }
      return true;
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `${COLLECTIONS.EQUIPMENTS}/${id}`);
      return false;
    }
  },

  // Busca rápida de máquina por ID, código, etiqueta ou patrimônio para preenchimento de O.S.
  async findEquipmentByIdOrCode(searchCode: string): Promise<{
    equipment: Equipment;
    address?: Address;
    client?: Client;
  } | null> {
    const rawCode = (searchCode || '').trim();
    if (!rawCode) return null;

    try {
      let foundEq: Equipment | null = null;

      // 1. Tenta buscar direto pelo doc ID original (ex: "0042", "42", etc.)
      const directRef = doc(db, COLLECTIONS.EQUIPMENTS, rawCode);
      const directSnap = await getDoc(directRef);
      if (directSnap.exists()) {
        foundEq = { id: directSnap.id, ...(directSnap.data() as any) } as Equipment;
      }

      // 2. Se for número e não achou direto, tenta com zero padding (ex: "42" -> "0042")
      if (!foundEq) {
        const numVal = parseInt(rawCode, 10);
        if (!isNaN(numVal)) {
          const padded = numVal.toString().padStart(4, '0');
          if (padded !== rawCode) {
            const paddedSnap = await getDoc(doc(db, COLLECTIONS.EQUIPMENTS, padded));
            if (paddedSnap.exists()) {
              foundEq = { id: paddedSnap.id, ...(paddedSnap.data() as any) } as Equipment;
            }
          }
        }
      }

      // 3. Se ainda não achou, busca no conjunto completo em memória/cache por ID, label ou patrimônio
      if (!foundEq) {
        const allEquipments = await dataService.getEquipments(undefined, true);
        const lowerCode = rawCode.toLowerCase();
        const numVal = parseInt(rawCode, 10);
        const paddedNum = !isNaN(numVal) ? numVal.toString().padStart(4, '0') : '';

        foundEq = allEquipments.find(eq => {
          const eqId = (eq.id || '').toLowerCase();
          const eqPatrimony = (eq.patrimony || '').toLowerCase();
          const eqLabel = (eq.label || '').toLowerCase();
          return (
            eqId === lowerCode ||
            (paddedNum && eqId === paddedNum) ||
            (!isNaN(numVal) && parseInt(eq.id, 10) === numVal) ||
            eqPatrimony === lowerCode ||
            eqLabel === lowerCode
          );
        }) || null;
      }

      if (!foundEq) return null;

      // Localiza endereço e cliente correspondentes
      let address: Address | undefined;
      let client: Client | undefined;

      if (foundEq.addressId) {
        const addresses = await dataService.getAddresses();
        address = addresses.find(a => a.id === foundEq!.addressId);

        if (address && address.clientId) {
          const clients = await dataService.getClients();
          client = clients.find(c => c.id === address!.clientId);
        }
      }

      return {
        equipment: foundEq,
        address,
        client
      };
    } catch (e) {
      console.error('Erro ao buscar máquina por código/ID:', e);
      return null;
    }
  },

  // Reativação de equipamento desativado
  async reactivateEquipment(id: string) {
    try {
      const eqDoc = await getDoc(doc(db, COLLECTIONS.EQUIPMENTS, id));
      let addressId = '';
      if (eqDoc.exists()) {
        addressId = eqDoc.data()?.addressId || '';
      }

      const reactivationData: Partial<Equipment> = {
        status: 'active',
        active: true,
        isDeactivated: false,
        reactivatedAt: new Date().toISOString()
      };

      await updateDoc(doc(db, COLLECTIONS.EQUIPMENTS, id), clean(reactivationData));
      await historyService.log(id, 'Equipment', 'Reactivate', reactivationData);
      
      clearCache('equipments_');

      if (addressId) {
        await dataService.syncAddressMachinesCount(addressId);
      }
      return true;
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `${COLLECTIONS.EQUIPMENTS}/${id}`);
      return false;
    }
  },

  async deleteEquipment(id: string, permanent: boolean = false) {
    try {
      if (!permanent) {
        // Por padrão e para segurança de auditoria, realiza desativação suave (soft-deactivate)
        return await dataService.deactivateEquipment(id, 'Exclusão solicitada via painel', 'Administrador');
      }

      const eqDoc = await getDoc(doc(db, COLLECTIONS.EQUIPMENTS, id));
      let addressId = '';
      if (eqDoc.exists()) {
        addressId = eqDoc.data()?.addressId || '';
      }

      await deleteDoc(doc(db, COLLECTIONS.EQUIPMENTS, id));
      await historyService.log(id, 'Equipment', 'Delete', { message: 'Equipamento removido permanentemente' });
      
      clearCache('equipments_');

      if (addressId) {
        await dataService.syncAddressMachinesCount(addressId);
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `${COLLECTIONS.EQUIPMENTS}/${id}`);
    }
  },

  async syncAddressMachinesCount(addressId: string) {
    try {
      if (!addressId) return;
      const q = query(collection(db, COLLECTIONS.EQUIPMENTS), where('addressId', '==', addressId));
      const snapshot = await getDocs(q);
      
      // Contar apenas equipamentos ativos e que NÃO estejam pendentes de aprovação técnica
      const activeOfficialEquips = snapshot.docs.filter(doc => {
        const d = doc.data();
        const isNotDeactivated = d.status !== 'deactivated' && d.active !== false && !d.isDeactivated;
        const isOfficial = !d.isPendingApproval && !d.addedByTech;
        return isNotDeactivated && isOfficial;
      });
      const count = activeOfficialEquips.length;

      // Se não há equipamentos cadastrados individualmente mas o endereço já possui totalMachines cadastrado na contratação, preserva
      const addrDoc = await getDoc(doc(db, COLLECTIONS.ADDRESSES, addressId));
      if (addrDoc.exists()) {
        const addrData = addrDoc.data();
        const currentOfficial = addrData?.totalMachines || 0;
        
        // Se temos equipamentos oficiais cadastrados individualmente, atualiza com a contagem oficial
        if (count > 0) {
          if (currentOfficial !== count) {
            await updateDoc(doc(db, COLLECTIONS.ADDRESSES, addressId), {
              totalMachines: count
            });
            await historyService.log(addressId, 'Address', 'SyncMachinesCount', { totalMachines: count });
          }
        }
      }
    } catch (e) {
      console.error('Error syncing address machines count:', e);
    }
  },

  // Jetting Control (Centro de Controle de Jateamento) Methods
  async getJettingControls(): Promise<JettingControl[]> {
    try {
      const snapshot = await getDocs(collection(db, COLLECTIONS.JETTING_CONTROL));
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as JettingControl));
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, COLLECTIONS.JETTING_CONTROL);
      return [];
    }
  },

  async addJettingControl(item: Omit<JettingControl, 'id'>) {
    try {
      const docRef = await addDoc(collection(db, COLLECTIONS.JETTING_CONTROL), {
        ...clean(item),
        updatedAt: serverTimestamp()
      });
      await historyService.log(docRef.id, 'JettingControl', 'Create', item);
      return docRef.id;
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, COLLECTIONS.JETTING_CONTROL);
      return null;
    }
  },

  async updateJettingControl(id: string, data: Partial<JettingControl>) {
    try {
      await updateDoc(doc(db, COLLECTIONS.JETTING_CONTROL, id), {
        ...clean(data),
        updatedAt: serverTimestamp()
      });
      await historyService.log(id, 'JettingControl', 'Update', data);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `${COLLECTIONS.JETTING_CONTROL}/${id}`);
    }
  },

  async deleteJettingControl(id: string) {
    try {
      await deleteDoc(doc(db, COLLECTIONS.JETTING_CONTROL, id));
      await historyService.log(id, 'JettingControl', 'Delete', { id });
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `${COLLECTIONS.JETTING_CONTROL}/${id}`);
    }
  },

  async syncJettingControlForFinishedOs(addressId: string, osNumber: string, equipmentId?: string, description?: string) {
    try {
      if (!addressId || !osNumber) return;
      const allJettings = await this.getJettingControls();
      const addressJettings = allJettings.filter(j => j.addressId === addressId);
      if (addressJettings.length === 0) return;

      for (const jet of addressJettings) {
        if (!jet.id || !jet.equipmentsText) continue;
        const machinesArray = jet.equipmentsText.split(';').map(x => x.trim()).filter(Boolean);
        const currentChecked: Record<string, { checked: boolean; os: string }> = { ...(jet.checkedEquipments || {}) };
        let modified = false;

        machinesArray.forEach((mach, idx) => {
          const eqKey = `${idx}_${mach}`;
          const cleanName = mach.includes('_') ? mach.substring(mach.indexOf('_') + 1) : mach;
          const config = currentChecked[eqKey] || currentChecked[cleanName] || { checked: false, os: '' };

          // Verificar se essa máquina corresponde à OS
          const isDirectOsMatch = config.os && config.os.trim().toUpperCase() === osNumber.trim().toUpperCase();
          let isMatch = isDirectOsMatch;

          if (!isMatch && !config.checked) {
            if (equipmentId && mach.includes(equipmentId)) {
              isMatch = true;
            } else if (description) {
              const sectorMatch = mach.match(/\(([^)]+)\)/);
              const targetSector = sectorMatch ? sectorMatch[1].trim().toUpperCase() : '';
              if (targetSector && description.toUpperCase().includes(targetSector)) {
                isMatch = true;
              }
            }
          }

          if (isMatch) {
            currentChecked[eqKey] = { checked: true, os: config.os || osNumber.trim() };
            modified = true;
          }
        });

        if (modified) {
          const checkedCount = machinesArray.filter((m, i) => {
            const k = `${i}_${m}`;
            return (currentChecked[k] || currentChecked[m])?.checked;
          }).length;

          const newStatus = checkedCount === machinesArray.length ? 'Concluído' : checkedCount > 0 ? 'Em Andamento' : 'Pendente';
          const uniqueOsList = Array.from(
            new Set(
              Object.values(currentChecked)
                .filter(v => v.os && v.os.trim() !== '')
                .map(v => v.os.trim())
            )
          ).filter(Boolean);

          await this.updateJettingControl(jet.id, {
            checkedEquipments: currentChecked,
            serviceOrders: uniqueOsList.join(', '),
            status: newStatus
          });
        }
      }
    } catch (err) {
      console.warn('Erro ao sincronizar O.S. finalizada com a central de jateamento:', err);
    }
  },

  async processJettingForRecord(record: MaintenanceRecord, checklist: any[]) {
    try {
      if (!record || !record.addressId || !checklist || checklist.length === 0) return;

      // 1. Fetch address to verify client and address details
      const addressDoc = await getDoc(doc(db, COLLECTIONS.ADDRESSES, record.addressId));
      if (!addressDoc.exists()) return;
      const addressData = addressDoc.data() as Address;

      const clientDoc = await getDoc(doc(db, COLLECTIONS.CLIENTS, addressData.clientId));
      const clientName = clientDoc.exists() ? (clientDoc.data() as Client).name : 'Cliente';
      const addressStreet = `${addressData.street}, ${addressData.number || ''}`;

      // 2. Scan the checklist items for any machine with any non-empty note/observation
      const jettingItems = checklist.filter(item => {
        if (!item || item.notes === undefined || item.notes === null) return false;
        const notesStr = typeof item.notes === 'string' ? item.notes.trim() : String(item.notes).trim();
        return notesStr.length > 0;
      });

      if (jettingItems.length === 0) {
        return; // No equipments with observations
      }

      // 3. Fetch equipments details for this address to match their names/sectors
      const equipsSnapshot = await getDocs(query(collection(db, COLLECTIONS.EQUIPMENTS), where('addressId', '==', record.addressId)));
      const equipsMap = new Map<string, any>();
      equipsSnapshot.docs.forEach(d => {
        equipsMap.set(d.id, d.data());
      });

      // 4. Construct the equipments text list with machine power/BTUs, sector and its observation (substituindo tipo por potência)
      const parts = jettingItems.map(item => {
        const eqData = equipsMap.get(item.equipmentId);
        let powerPart = '';
        if (eqData && eqData.btus) {
          const raw = String(eqData.btus).replace(/\./g, '').trim();
          const num = Number(raw);
          const formatted = !isNaN(num) && num > 0 ? (num < 1000 ? num * 1000 : num).toLocaleString('pt-BR') : String(eqData.btus).trim();
          powerPart = formatted.toUpperCase().includes('BTU') || formatted.toUpperCase().includes('TR')
            ? formatted
            : `${formatted} BTUs`;
        } else if (eqData && eqData.brand) {
          powerPart = eqData.brand;
        }

        const sectorPart = eqData ? (eqData.sector || 'Sem Setor') : `Item #${item.equipmentId}`;
        const namePart = powerPart ? `${powerPart} (${sectorPart})` : `(${sectorPart})`;
        const noteStr = typeof item.notes === 'string' ? item.notes.trim() : String(item.notes || '').trim();
        const basePart = noteStr ? `${namePart} - Obs: ${noteStr}` : namePart;
        return `${basePart} [ID:${item.equipmentId}]`;
      });
      const equipmentsText = parts.join('; ');

      // 5. Rule: "se ainda houver algum registro ativo anterior desse mesmo endereço ele deve ser excluido e substituido pelo mais recente"
      // Find and delete any existing JettingControl records for this addressId that belong to the SAME month or the SAME recordId (to avoid deleting historic data from other months)
      const existingQuery = query(collection(db, COLLECTIONS.JETTING_CONTROL), where('addressId', '==', record.addressId));
      const existingSnapshot = await getDocs(existingQuery);
      
      if (!existingSnapshot.empty) {
        const batch = writeBatch(db);
        let deletedCount = 0;
        existingSnapshot.docs.forEach(docSnap => {
          const data = docSnap.data() as any;
          const isSameRecord = data.recordId === record.id;
          const isSameMonth = data.month === record.month;
          const isLegacy = !data.month && !data.recordId;
          
          if (isSameRecord || isSameMonth || isLegacy) {
            batch.delete(docSnap.ref);
            deletedCount++;
          }
        });
        if (deletedCount > 0) {
          await batch.commit();
        }
      }

      // 6. Create the new JettingControl item
      const technicianName = [record.technician1, record.technician2].filter(Boolean).join(' / ');
      const newJetting: Omit<JettingControl, 'id'> = {
        addressId: record.addressId,
        clientName,
        addressStreet,
        equipmentsText,
        status: 'Pendente',
        serviceOrders: '',
        notes: '',
        updatedAt: serverTimestamp(),
        recordId: record.id,
        month: record.month,
        technicianName: technicianName || ''
      };

      await dataService.addJettingControl(newJetting);
      console.log(`Automaticamente registrado jateamento para o endereço ${addressStreet}`);
    } catch (e) {
      console.error('Erro ao processar central de jateamento para a planilha:', e);
    }
  },

  // Service Orders (Ordens de Serviço - OS)
  async getServiceOrders(clientId?: string, limitCount?: number): Promise<ServiceOrder[]> {
    const cacheKey = clientId 
      ? `service_orders_client_${clientId}${limitCount ? `_limit_${limitCount}` : ''}` 
      : `service_orders_all${limitCount ? `_limit_${limitCount}` : ''}`;
    return getCachedData(cacheKey, async () => {
      try {
        let snapshot;
        const constraints: any[] = [];
        if (clientId) {
          constraints.push(where('clientId', '==', clientId));
        }
        if (limitCount && limitCount > 0) {
          constraints.push(limit(limitCount));
        }

        if (constraints.length > 0) {
          const q = query(collection(db, COLLECTIONS.SERVICE_ORDERS), ...constraints);
          snapshot = await getDocs(q);
        } else {
          snapshot = await getDocs(collection(db, COLLECTIONS.SERVICE_ORDERS));
        }
        const orders = snapshot.docs.map(doc => normalizeServiceOrderStatus({ id: doc.id, ...(doc.data() as any) } as ServiceOrder));
        
        // Ordenar rigorosamente por data de criação: da mais recente para a mais antiga (independente de edições)
        return sortOrdersByCreationDateDesc(orders);
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, COLLECTIONS.SERVICE_ORDERS);
        return [];
      }
    });
  },

  async getServiceOrdersByAddress(addressId: string): Promise<ServiceOrder[]> {
    try {
      const q = query(collection(db, COLLECTIONS.SERVICE_ORDERS), where('addressId', '==', addressId));
      const snapshot = await getDocs(q);
      const orders = snapshot.docs.map(doc => normalizeServiceOrderStatus({ id: doc.id, ...(doc.data() as any) } as ServiceOrder));
      return sortOrdersByCreationDateDesc(orders);
    } catch (e) {
      console.error('Erro ao buscar ordens de serviço por endereço:', e);
      return [];
    }
  },

  // Consulta paginada direta no Firestore com cursor (para volumes massivos)
  async getServiceOrdersPaginated(options: {
    clientId?: string;
    pageSize?: number;
    lastDoc?: any;
    status?: string;
  }): Promise<{ orders: ServiceOrder[]; lastDoc: any; hasMore: boolean }> {
    try {
      const pageSize = options.pageSize || 25;
      const constraints: any[] = [];
      
      if (options.clientId) {
        constraints.push(where('clientId', '==', options.clientId));
      }
      if (options.status && options.status !== 'all') {
        constraints.push(where('status', '==', options.status));
      }
      if (options.lastDoc) {
        constraints.push(startAfter(options.lastDoc));
      }
      constraints.push(limit(pageSize + 1));

      const q = query(collection(db, COLLECTIONS.SERVICE_ORDERS), ...constraints);
      const snapshot = await getDocs(q);
      
      const hasMore = snapshot.docs.length > pageSize;
      const resultDocs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;
      const lastDoc = resultDocs.length > 0 ? resultDocs[resultDocs.length - 1] : null;

      const orders = resultDocs.map(doc => normalizeServiceOrderStatus({ id: doc.id, ...(doc.data() as any) } as ServiceOrder));
      return { orders: sortOrdersByCreationDateDesc(orders), lastDoc, hasMore };
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, COLLECTIONS.SERVICE_ORDERS);
      return { orders: [], lastDoc: null, hasMore: false };
    }
  },

  async getServiceOrder(id: string): Promise<ServiceOrder | null> {
    try {
      const docSnap = await getDoc(doc(db, COLLECTIONS.SERVICE_ORDERS, id));
      if (docSnap.exists()) {
        return normalizeServiceOrderStatus({ id: docSnap.id, ...docSnap.data() } as ServiceOrder);
      }
      return null;
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, `${COLLECTIONS.SERVICE_ORDERS}/${id}`);
      return null;
    }
  },

  async addServiceOrder(order: ServiceOrder) {
    try {
      // PRESERVAÇÃO RIGOROSA DA DATA DE CRIAÇÃO ORIGINAL:
      // O único critério de ordenamento da O.S. é a data de criação.
      // Edições posteriores (updatedAt) NUNCA podem alterar ou sobrescrever a data de criação original.
      let finalCreatedAt = order.createdAt;

      // Se não veio no objeto ou se for edição de documento existente, recupera a criação original
      if (!finalCreatedAt && order.id) {
        try {
          const existingSnap = await getDoc(doc(db, COLLECTIONS.SERVICE_ORDERS, order.id));
          if (existingSnap.exists()) {
            const exData = existingSnap.data();
            finalCreatedAt = exData?.createdAt || exData?.openedAt;
          }
        } catch {
          // fallback silencioso
        }
      }

      // Se ainda não existir (ordem verdadeiramente nova), usa openedAt ou serverTimestamp()
      if (!finalCreatedAt) {
        finalCreatedAt = order.openedAt || serverTimestamp();
      }

      // REGRA: Somente o sistema administrativo tem autonomia para finalizar uma O.S.
      // Caso uma O.S. venha como 'finalizada' sem adminFinalized: true, força 'aberta' e techFinalized: true
      const normalizedInput = normalizeServiceOrderStatus(order);

      const cleanOrder = clean({
        ...normalizedInput,
        createdAt: finalCreatedAt,
        updatedAt: serverTimestamp()
      });
      await setDoc(doc(db, COLLECTIONS.SERVICE_ORDERS, order.id), cleanOrder, { merge: true });
      await historyService.log(order.id, 'ServiceOrder', 'Upsert', order);
      clearCache('service_orders_');
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, COLLECTIONS.SERVICE_ORDERS);
    }
  },

  async updateServiceOrder(id: string, data: Partial<ServiceOrder>) {
    try {
      // NUNCA sobrescreve createdAt ao atualizar/editar a O.S.
      const { createdAt: _ignoredCreatedAt, ...restData } = data;
      const cleanData = clean({
        ...restData,
        updatedAt: serverTimestamp()
      });
      await updateDoc(doc(db, COLLECTIONS.SERVICE_ORDERS, id), cleanData);
      await historyService.log(id, 'ServiceOrder', 'Update', data);
      clearCache('service_orders_');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `${COLLECTIONS.SERVICE_ORDERS}/${id}`);
    }
  },

  async cancelServiceOrder(id: string) {
    try {
      const cleanData = clean({
        status: 'cancelada',
        updatedAt: serverTimestamp()
      });
      await updateDoc(doc(db, COLLECTIONS.SERVICE_ORDERS, id), cleanData);
      await historyService.log(id, 'ServiceOrder', 'Cancel', { message: 'Ordem de serviço cancelada' });
      clearCache('service_orders_');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `${COLLECTIONS.SERVICE_ORDERS}/${id}`);
    }
  },

  async reopenServiceOrder(id: string) {
    try {
      const cleanData = clean({
        status: 'aberta',
        updatedAt: serverTimestamp()
      });
      await updateDoc(doc(db, COLLECTIONS.SERVICE_ORDERS, id), cleanData);
      await historyService.log(id, 'ServiceOrder', 'Reopen', { message: 'Ordem de serviço reaberta' });
      clearCache('service_orders_');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `${COLLECTIONS.SERVICE_ORDERS}/${id}`);
    }
  },

  async deleteServiceOrder(id: string) {
    // Por segurança e rastreabilidade, O.S. não é excluída fisicamente; é marcada como cancelada
    return this.cancelServiceOrder(id);
  },

  // ==========================================
  // CATÁLOGO DE PRODUTOS E SERVIÇOS DE O.S.
  // ==========================================

  async getServiceCatalogItems(): Promise<ServiceCatalogItem[]> {
    return getCachedData('service_catalog_items', async () => {
      try {
        const q = query(collection(db, COLLECTIONS.SERVICE_CATALOG));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
          // Inicializa com os itens padrões pré-definidos caso o catálogo esteja vazio
          const defaultItems: Omit<ServiceCatalogItem, 'id'>[] = [
            {
              code: '61',
              description: 'MANUTENCAO NIVEL 2- MANUTENCAO DE CARENAGEM,FILTRO DE AR, BANDEJA DE DRENO, APLICACAO DE ANTIBACTERICIDA COM JATEAMENTO DA EVAPORADORA SPLIT 12.000 BTUS',
              type: 'service',
              unit: 'UN',
              defaultPrice: 77.25,
              defaultDiscountPercent: 59.34,
              order: 0,
              active: true,
              clientPrices: {}
            },
            {
              code: '62',
              description: 'MANUTENCAO NIVEL 2- MANUTENCAO DE CARENAGEM,FILTRO DE AR, BANDEJA DE DRENO, APLICACAO DE ANTIBACTERICIDA COM JATEAMENTO DA EVAPORADORA SPLIT 18.000 A 30.000 BTUS',
              type: 'service',
              unit: 'UN',
              defaultPrice: 95.00,
              defaultDiscountPercent: 0,
              order: 1,
              active: true,
              clientPrices: {}
            },
            {
              code: '63',
              description: 'CARGA DE GAS FLUIDO REFRIGERANTE R410A / R22',
              type: 'service',
              unit: 'UN',
              defaultPrice: 150.00,
              defaultDiscountPercent: 0,
              order: 2,
              active: true,
              clientPrices: {}
            },
            {
              code: '64',
              description: 'CONSERTO DE PLACA ELETRONICA OU REPARO ELETRICO',
              type: 'service',
              unit: 'UN',
              defaultPrice: 120.00,
              defaultDiscountPercent: 0,
              order: 3,
              active: true,
              clientPrices: {}
            },
            {
              code: '336',
              description: 'GAS FLUIDO REF R410 DUGOLD 11,30KG',
              type: 'product',
              category: 'GASES REFRIGERANTES',
              unit: 'KG',
              defaultPrice: 42.65,
              defaultDiscountPercent: 0,
              order: 4,
              active: true,
              clientPrices: {}
            },
            {
              code: '337',
              description: 'GAS FLUIDO R22 DUGOLD 13,6KG',
              type: 'product',
              category: 'GASES REFRIGERANTES',
              unit: 'KG',
              defaultPrice: 48.50,
              defaultDiscountPercent: 0,
              order: 5,
              active: true,
              clientPrices: {}
            },
            {
              code: '338',
              description: 'CAPACITOR DE PARTIDA PARA COMPRESSOR',
              type: 'product',
              category: 'CAPACITORES & ELÉTRICA',
              unit: 'UN',
              defaultPrice: 35.00,
              defaultDiscountPercent: 0,
              order: 6,
              active: true,
              clientPrices: {}
            },
            {
              code: '339',
              description: 'SENSORS DE TEMPERATURA E DEGELO',
              type: 'product',
              category: 'SENSORES & ELETRÔNICOS',
              unit: 'UN',
              defaultPrice: 15.00,
              defaultDiscountPercent: 0,
              order: 7,
              active: true,
              clientPrices: {}
            }
          ];

          const seededItems: ServiceCatalogItem[] = [];
          for (const item of defaultItems) {
            try {
              const docRef = await addDoc(collection(db, COLLECTIONS.SERVICE_CATALOG), {
                ...clean(item),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
              });
              seededItems.push({ id: docRef.id, ...item });
            } catch (seedErr) {
              console.warn('Erro ao semear item padrão:', seedErr);
            }
          }
          if (seededItems.length > 0) {
            return seededItems;
          }
        }
        const items = snapshot.docs.map(doc => {
          const data = doc.data() as any;
          // Corrige bug legado onde o item 336 (Gás R410) estava com desconto indevido de 74.61%
          if (data.code === '336' && (data.defaultDiscountPercent === 74.61 || (data.clientPrices && Object.values(data.clientPrices).some((cp: any) => cp?.discountPercent === 74.61)))) {
            const updatedClientPrices = { ...(data.clientPrices || {}) };
            let hasPriceChange = false;
            Object.keys(updatedClientPrices).forEach(cId => {
              if (updatedClientPrices[cId]?.discountPercent === 74.61) {
                updatedClientPrices[cId] = { ...updatedClientPrices[cId], discountPercent: 0 };
                hasPriceChange = true;
              }
            });
            const newDiscount = data.defaultDiscountPercent === 74.61 ? 0 : data.defaultDiscountPercent;
            updateDoc(doc.ref, { 
              defaultDiscountPercent: newDiscount,
              ...(hasPriceChange ? { clientPrices: updatedClientPrices } : {})
            }).catch(console.error);
            return { 
              id: doc.id, 
              ...data, 
              defaultDiscountPercent: newDiscount,
              clientPrices: updatedClientPrices 
            } as ServiceCatalogItem;
          }
          return { id: doc.id, ...data } as ServiceCatalogItem;
        });
        return items.sort((a, b) => {
          const orderA = a.order !== undefined && a.order !== null ? a.order : 999999;
          const orderB = b.order !== undefined && b.order !== null ? b.order : 999999;
          if (orderA !== orderB) return orderA - orderB;
          return (a.code || '').localeCompare(b.code || '', undefined, { numeric: true });
        });
      } catch (e) {
        console.error('Error fetching service catalog items:', e);
        return [];
      }
    });
  },

  async addServiceCatalogItem(item: Omit<ServiceCatalogItem, 'id'> & { id?: string }) {
    try {
      const cleanData = clean({
        ...item,
        code: (item.code || '').trim().toUpperCase(),
        description: (item.description || '').trim().toUpperCase(),
        unit: (item.unit || 'UN').trim().toUpperCase(),
        type: item.type || 'service',
        category: item.category ? item.category.trim().toUpperCase() : '',
        defaultPrice: Number(item.defaultPrice) || 0,
        defaultDiscountPercent: Number(item.defaultDiscountPercent) || 0,
        active: item.active !== false,
        order: item.order !== undefined && item.order !== null ? Number(item.order) : Date.now(),
        clientPrices: item.clientPrices || {},
        createdAt: item.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      let id = item.id;
      if (id) {
        await setDoc(doc(db, COLLECTIONS.SERVICE_CATALOG, id), cleanData, { merge: true });
      } else {
        const docRef = await addDoc(collection(db, COLLECTIONS.SERVICE_CATALOG), cleanData);
        id = docRef.id;
      }
      await historyService.log(id, 'ServiceCatalogItem', 'Create', { code: item.code, description: item.description });
      clearCache('service_catalog_items');
      return id;
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, COLLECTIONS.SERVICE_CATALOG);
    }
  },

  async updateServiceCatalogItem(id: string, data: Partial<ServiceCatalogItem>) {
    try {
      const cleanData = clean({
        ...data,
        ...(data.code ? { code: data.code.trim().toUpperCase() } : {}),
        ...(data.description ? { description: data.description.trim().toUpperCase() } : {}),
        ...(data.unit ? { unit: data.unit.trim().toUpperCase() } : {}),
        ...(data.category !== undefined ? { category: data.category ? data.category.trim().toUpperCase() : '' } : {}),
        ...(data.defaultPrice !== undefined ? { defaultPrice: Number(data.defaultPrice) || 0 } : {}),
        ...(data.defaultDiscountPercent !== undefined ? { defaultDiscountPercent: Number(data.defaultDiscountPercent) || 0 } : {}),
        ...(data.order !== undefined ? { order: Number(data.order) } : {}),
        updatedAt: serverTimestamp()
      });
      await updateDoc(doc(db, COLLECTIONS.SERVICE_CATALOG, id), cleanData);
      await historyService.log(id, 'ServiceCatalogItem', 'Update', data);
      clearCache('service_catalog_items');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `${COLLECTIONS.SERVICE_CATALOG}/${id}`);
    }
  },

  async reorderServiceCatalogItems(orderedItemIds: string[]) {
    try {
      const batch = writeBatch(db);
      orderedItemIds.forEach((id, index) => {
        const docRef = doc(db, COLLECTIONS.SERVICE_CATALOG, id);
        batch.update(docRef, {
          order: index,
          updatedAt: serverTimestamp()
        });
      });
      await batch.commit();
      clearCache('service_catalog_items');
    } catch (e) {
      console.error('Error reordering service catalog items:', e);
      handleFirestoreError(e, OperationType.UPDATE, `${COLLECTIONS.SERVICE_CATALOG}/reorder`);
    }
  },

  async deleteServiceCatalogItem(id: string) {
    try {
      await deleteDoc(doc(db, COLLECTIONS.SERVICE_CATALOG, id));
      await historyService.log(id, 'ServiceCatalogItem', 'Delete', { message: 'Item removido do catálogo' });
      clearCache('service_catalog_items');
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `${COLLECTIONS.SERVICE_CATALOG}/${id}`);
    }
  },

  async updateServiceCatalogClientPrices(itemId: string, clientId: string, priceData: ClientPriceOverride | null) {
    try {
      const docRef = doc(db, COLLECTIONS.SERVICE_CATALOG, itemId);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) return;
      const current = docSnap.data() as ServiceCatalogItem;
      const clientPrices = { ...(current.clientPrices || {}) };
      if (priceData === null) {
        delete clientPrices[clientId];
      } else {
        clientPrices[clientId] = {
          price: Number(priceData.price) || 0,
          discountPercent: priceData.discountPercent !== undefined ? Number(priceData.discountPercent) || 0 : 0
        };
      }
      await updateDoc(docRef, {
        clientPrices,
        updatedAt: serverTimestamp()
      });
      await historyService.log(itemId, 'ServiceCatalogItem', 'UpdateClientPrice', { clientId, priceData });
      clearCache('service_catalog_items');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `${COLLECTIONS.SERVICE_CATALOG}/${itemId}`);
    }
  },

  async renameServiceCatalogCategory(oldCategory: string, newCategory: string, itemType?: 'service' | 'product'): Promise<number> {
    try {
      const oldCatClean = (oldCategory || '').trim().toUpperCase();
      const newCatClean = (newCategory || '').trim().toUpperCase();
      if (!oldCatClean || !newCatClean || oldCatClean === newCatClean) return 0;
      
      const q = query(collection(db, COLLECTIONS.SERVICE_CATALOG));
      const snapshot = await getDocs(q);
      const matchingDocs = snapshot.docs.filter(d => {
        const data = d.data();
        const catMatch = (data.category || '').trim().toUpperCase() === oldCatClean;
        if (!catMatch) return false;
        if (itemType && data.type !== itemType) return false;
        return true;
      });
      
      let count = 0;
      for (const docSnap of matchingDocs) {
        await updateDoc(docSnap.ref, {
          category: newCatClean,
          updatedAt: serverTimestamp()
        });
        count++;
      }
      if (count > 0) {
        await historyService.log('category_manager', 'ServiceCatalog', 'RenameCategory', {
          oldCategory: oldCatClean,
          newCategory: newCatClean,
          itemType: itemType || 'all',
          affectedItemsCount: count
        });
      }
      clearCache('service_catalog_items');
      return count;
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `${COLLECTIONS.SERVICE_CATALOG}/categories`);
      return 0;
    }
  },

  async deleteServiceCatalogCategory(category: string, reassignToCategory?: string, itemType?: 'service' | 'product'): Promise<number> {
    try {
      const targetCatClean = (category || '').trim().toUpperCase();
      const reassignClean = reassignToCategory ? reassignToCategory.trim().toUpperCase() : '';
      if (!targetCatClean) return 0;

      const q = query(collection(db, COLLECTIONS.SERVICE_CATALOG));
      const snapshot = await getDocs(q);
      const matchingDocs = snapshot.docs.filter(d => {
        const data = d.data();
        const catMatch = (data.category || '').trim().toUpperCase() === targetCatClean;
        if (!catMatch) return false;
        if (itemType && data.type !== itemType) return false;
        return true;
      });

      let count = 0;
      for (const docSnap of matchingDocs) {
        await updateDoc(docSnap.ref, {
          category: reassignClean || '',
          updatedAt: serverTimestamp()
        });
        count++;
      }
      if (count > 0) {
        await historyService.log('category_manager', 'ServiceCatalog', 'DeleteCategory', {
          deletedCategory: targetCatClean,
          reassignedTo: reassignClean || null,
          itemType: itemType || 'all',
          affectedItemsCount: count
        });
      }
      clearCache('service_catalog_items');
      return count;
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `${COLLECTIONS.SERVICE_CATALOG}/categories`);
      return 0;
    }
  },

  // ----------------------------------------------------
  // ROUTE EXPENSES (Despesas de Rotas e Viagens)
  // ----------------------------------------------------

  async getRouteExpenses(month?: string, routeName?: string, technicianId?: string): Promise<RouteExpense[]> {
    const cacheKey = `route_expenses_${month || 'all'}_${routeName || 'all'}_${technicianId || 'all'}`;
    return getCachedData(cacheKey, async () => {
      try {
        let q = query(collection(db, COLLECTIONS.ROUTE_EXPENSES));
        if (month) {
          q = query(q, where('month', '==', month));
        }
        if (routeName) {
          q = query(q, where('routeName', '==', routeName));
        }
        if (technicianId) {
          q = query(q, where('technicianId', '==', technicianId));
        }
        const snapshot = await getDocs(q);
        const expenses = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as RouteExpense));
        // Sort descending by date
        expenses.sort((a, b) => {
          const dateA = a.expenseDate || '';
          const dateB = b.expenseDate || '';
          return dateB.localeCompare(dateA);
        });
        return expenses;
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, COLLECTIONS.ROUTE_EXPENSES);
        return [];
      }
    });
  },

  async getAllRouteExpenses(): Promise<RouteExpense[]> {
    return this.getRouteExpenses();
  },

  async saveRouteExpense(expense: Omit<RouteExpense, 'id'> & { id?: string }): Promise<string> {
    try {
      const now = new Date();
      if (expense.id) {
        const docRef = doc(db, COLLECTIONS.ROUTE_EXPENSES, expense.id);
        await setDoc(docRef, clean({
          ...expense,
          updatedAt: serverTimestamp()
        }), { merge: true });
        await historyService.log(expense.id, 'RouteExpense', 'Update', expense);
        clearCache('route_expenses_');
        return expense.id;
      } else {
        const collRef = collection(db, COLLECTIONS.ROUTE_EXPENSES);
        const newDocRef = await addDoc(collRef, clean({
          ...expense,
          status: expense.status || 'pending',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }));
        await historyService.log(newDocRef.id, 'RouteExpense', 'Create', expense);
        clearCache('route_expenses_');
        return newDocRef.id;
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, COLLECTIONS.ROUTE_EXPENSES);
      throw e;
    }
  },

  async deleteRouteExpense(id: string): Promise<void> {
    try {
      const docRef = doc(db, COLLECTIONS.ROUTE_EXPENSES, id);
      await deleteDoc(docRef);
      await historyService.log(id, 'RouteExpense', 'Delete', { id });
      clearCache('route_expenses_');
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, COLLECTIONS.ROUTE_EXPENSES);
      throw e;
    }
  },

  async updateRouteExpenseStatus(
    id: string, 
    status: RouteExpenseStatus, 
    reviewNotes?: string, 
    reviewerName?: string, 
    reviewerId?: string
  ): Promise<void> {
    try {
      const docRef = doc(db, COLLECTIONS.ROUTE_EXPENSES, id);
      const updatePayload: any = {
        status,
        updatedAt: serverTimestamp()
      };
      if (reviewerName) updatePayload.reviewedByName = reviewerName;
      if (reviewerId) updatePayload.reviewedBy = reviewerId;
      if (reviewNotes !== undefined) updatePayload.reviewNotes = reviewNotes;
      updatePayload.reviewedAt = serverTimestamp();

      await updateDoc(docRef, clean(updatePayload));
      await historyService.log(id, 'RouteExpense', 'UpdateStatus', { status, reviewNotes, reviewerName });
      clearCache('route_expenses_');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, COLLECTIONS.ROUTE_EXPENSES);
      throw e;
    }
  },

  subscribeRouteExpenses(callback: (expenses: RouteExpense[]) => void, month?: string): () => void {
    try {
      let q = query(collection(db, COLLECTIONS.ROUTE_EXPENSES));
      if (month) {
        q = query(q, where('month', '==', month));
      }
      return onSnapshot(q, (snapshot) => {
        const expenses = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as RouteExpense));
        expenses.sort((a, b) => {
          const dateA = a.expenseDate || '';
          const dateB = b.expenseDate || '';
          return dateB.localeCompare(dateA);
        });
        clearCache('route_expenses_');
        callback(expenses);
      }, (error) => {
        console.warn('Erro na assinatura em tempo real de despesas de rotas:', error);
      });
    } catch (err) {
      console.error('Falha ao inicializar listener de despesas:', err);
      return () => {};
    }
  }
};
