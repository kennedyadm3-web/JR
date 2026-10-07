import { Technician, ServiceOrder } from '../types';
import { normalizeText } from './utils';

export interface IndexedTechnician {
  id: string;              // ID canônico único (ex: doc.id ou TEC_01)
  originalId: string;      // ID original do banco
  indexedCode: string;     // Código indexado único padronizado: TEC-01, TEC-02...
  indexNumber: number;     // 1, 2, 3...
  name: string;            // Nome padronizado em MAIÚSCULAS
  normalizedUpper: string; // Nome normalizado em MAIÚSCULAS (sem acentos nem pontuação)
}

export interface TechnicianIndexSystem {
  indexedTechs: IndexedTechnician[];
  findTech: (query: string | undefined | null) => IndexedTechnician | null;
  getCanonicalTechId: (query: string | undefined | null) => string | null;
  matchesTechTitular: (techField: string | undefined | null, targetQuery: string | undefined | null) => boolean;
  isOrderOwnedByTech: (order: Partial<ServiceOrder> | null | undefined, targetTechQuery: string | undefined | null) => boolean;
  normalizeTechString: (val: string | undefined | null) => string;
}

/**
 * Normaliza qualquer string de técnico transformando em MAIÚSCULAS e removendo acentos.
 * Ignora diferença entre letras minúsculas e maiúsculas transformando tudo em MAIÚSCULAS.
 */
export function normalizeTechString(val: string | undefined | null): string {
  if (!val) return '';
  return normalizeText(String(val).trim()).toUpperCase();
}

/**
 * Constrói o sistema de indexação de técnicos com IDs canônicos,
 * conversão mandatória para MAIÚSCULAS e busca case-insensitive/sem acentos.
 */
export function buildTechnicianIndex(techs: Technician[] = []): TechnicianIndexSystem {
  const indexedTechs: IndexedTechnician[] = techs.map((t, idx) => {
    const rawName = (t.name || '').trim().toUpperCase();
    const cleanId = (t.id || `TEC_${String(idx + 1).padStart(2, '0')}`).trim();
    const indexedCode = `TEC-${String(idx + 1).padStart(2, '0')}`;
    return {
      id: cleanId,
      originalId: t.id || cleanId,
      indexedCode,
      indexNumber: idx + 1,
      name: rawName,
      normalizedUpper: normalizeTechString(rawName)
    };
  });

  const byId = new Map<string, IndexedTechnician>();
  const byCode = new Map<string, IndexedTechnician>();
  const byName = new Map<string, IndexedTechnician>();
  const byNorm = new Map<string, IndexedTechnician>();

  indexedTechs.forEach(it => {
    if (it.id) byId.set(it.id.toUpperCase(), it);
    if (it.originalId) byId.set(it.originalId.toUpperCase(), it);
    if (it.indexedCode) byCode.set(it.indexedCode.toUpperCase(), it);
    if (it.name) byName.set(it.name, it);
    if (it.normalizedUpper) byNorm.set(it.normalizedUpper, it);
  });

  /**
   * Localiza um técnico no índice ignorando maiúsculas/minúsculas e acentos.
   */
  const findTech = (query: string | undefined | null): IndexedTechnician | null => {
    if (!query) return null;
    const qRaw = String(query).trim().toUpperCase();
    if (!qRaw) return null;

    // 1. Busca direta por ID em MAIÚSCULAS
    if (byId.has(qRaw)) return byId.get(qRaw)!;

    // 2. Busca direta por Código Indexado (TEC-01, TEC-02, TEC_01...)
    if (byCode.has(qRaw)) return byCode.get(qRaw)!;
    const altCode = qRaw.replace(/[-_]/g, '-');
    if (byCode.has(altCode)) return byCode.get(altCode)!;

    // 3. Busca direta por Nome em MAIÚSCULAS
    if (byName.has(qRaw)) return byName.get(qRaw)!;

    // 4. Busca por Nome Normalizado em MAIÚSCULAS (sem acentos)
    const qNorm = normalizeTechString(qRaw);
    if (byNorm.has(qNorm)) return byNorm.get(qNorm)!;

    // 5. Varredura com tolerância completa
    for (const it of indexedTechs) {
      if (
        it.id.toUpperCase() === qRaw ||
        it.originalId.toUpperCase() === qRaw ||
        it.indexedCode.toUpperCase() === qRaw ||
        it.name === qRaw ||
        it.normalizedUpper === qNorm
      ) {
        return it;
      }
    }

    return null;
  };

  const getCanonicalTechId = (query: string | undefined | null): string | null => {
    const t = findTech(query);
    return t ? t.id : null;
  };

  /**
   * Verifica se o técnico titular de uma ordem ou preventiva corresponde ao técnico consultado.
   * Transforma tudo em MAIÚSCULAS e compara exclusivamente com base na identidade única do titular,
   * evitando que ordens de serviço apareçam duplicadas para o técnico ajudante/auxiliar ou outro técnico.
   */
  const matchesTechTitular = (techField: string | undefined | null, targetQuery: string | undefined | null): boolean => {
    if (!techField || !targetQuery) return false;
    const tf = String(techField).trim().toUpperCase();
    const tq = String(targetQuery).trim().toUpperCase();
    if (!tf || !tq) return false;

    // Comparação direta rápida em MAIÚSCULAS
    if (tf === tq) return true;

    // Comparação normalizada sem acentos em MAIÚSCULAS
    const normTf = normalizeTechString(tf);
    const normTq = normalizeTechString(tq);
    if (normTf && normTq && normTf === normTq) return true;

    // Resolução via índice canônico
    const t1 = findTech(tf);
    const t2 = findTech(tq);
    if (t1 && t2) {
      return t1.id.toUpperCase() === t2.id.toUpperCase() || t1.indexedCode === t2.indexedCode;
    }

    return false;
  };

  /**
   * Verifica se a ordem de serviço pertence de forma exclusiva ao técnico consultado.
   * Resolve a falha onde as mesmas ordens de serviço apareciam para ambos os técnicos:
   * 1. Prioriza o technicianId como técnico titular da ordem.
   * 2. Se technicianId não estiver preenchido, verifica openedBy em MAIÚSCULAS.
   * 3. NÃO permite que o técnico auxiliar (technician2Id) receba a ordem como sua.
   */
  const isOrderOwnedByTech = (order: Partial<ServiceOrder> | null | undefined, targetTechQuery: string | undefined | null): boolean => {
    if (!order || !targetTechQuery) return false;
    const targetTech = findTech(targetTechQuery);
    const targetIdUpper = targetTech ? targetTech.id.toUpperCase() : String(targetTechQuery).trim().toUpperCase();
    const targetNorm = targetTech ? targetTech.normalizedUpper : normalizeTechString(targetTechQuery);

    // 1. Técnico titular atribuído na OS (technicianId)
    if (order.technicianId) {
      const orderTech = findTech(order.technicianId);
      if (orderTech) {
        return orderTech.id.toUpperCase() === targetIdUpper || orderTech.normalizedUpper === targetNorm;
      }
      return normalizeTechString(order.technicianId) === targetNorm || order.technicianId.trim().toUpperCase() === targetIdUpper;
    }

    // 2. Se não tem technicianId, verifica quem abriu a OS (openedBy)
    if (order.openedBy) {
      const openerTech = findTech(order.openedBy);
      if (openerTech) {
        return openerTech.id.toUpperCase() === targetIdUpper || openerTech.normalizedUpper === targetNorm;
      }
      return normalizeTechString(order.openedBy) === targetNorm;
    }

    return false;
  };

  return {
    indexedTechs,
    findTech,
    getCanonicalTechId,
    matchesTechTitular,
    isOrderOwnedByTech,
    normalizeTechString
  };
}
