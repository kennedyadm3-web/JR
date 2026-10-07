import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date) {
  if (!date) return '';
  if (typeof date === 'string') {
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [_, year, month, day] = match;
      return `${day}/${month}/${year}`;
    }
  }
  const d = new Date(date);
  return d.toLocaleDateString('pt-BR');
}

export function generateInitialOsNumber(): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const l1 = letters.charAt(Math.floor(Math.random() * letters.length));
  const l2 = letters.charAt(Math.floor(Math.random() * letters.length));
  const nums = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${l1}${l2}${nums}`;
}

/**
 * Extrai com máxima precisão o timestamp (em ms) da data de criação original da Ordem de Serviço.
 * Garante que edições posteriores (updatedAt) nunca alterem a posição ou ordenação da O.S.
 */
export function getOrderCreationTimestamp(order: any): number {
  if (!order) return 0;

  // 1º: Campo explícito createdAt (Timestamp Firestore, string ISO, toDate, toMillis ou ms)
  const c = order.createdAt;
  if (c) {
    if (typeof c === 'number' && !isNaN(c) && c > 0) return c;
    if (typeof c === 'string') {
      const t = new Date(c).getTime();
      if (!isNaN(t) && t > 0) return t;
    }
    if (typeof c === 'object') {
      if (typeof c.toMillis === 'function') return c.toMillis();
      if (typeof c.toDate === 'function') return c.toDate().getTime();
      if (c.seconds !== undefined) return c.seconds * 1000 + (c.nanoseconds ? Math.floor(c.nanoseconds / 1000000) : 0);
      if (c._seconds !== undefined) return c._seconds * 1000;
    }
  }

  // 2º: Data de abertura original informada na criação (openedAt)
  const o = order.openedAt;
  if (o) {
    if (typeof o === 'number' && !isNaN(o) && o > 0) return o;
    if (typeof o === 'string') {
      const t = new Date(o).getTime();
      if (!isNaN(t) && t > 0) return t;
    }
    if (typeof o === 'object') {
      if (typeof o.toMillis === 'function') return o.toMillis();
      if (typeof o.toDate === 'function') return o.toDate().getTime();
      if (o.seconds !== undefined) return o.seconds * 1000;
      if (o._seconds !== undefined) return o._seconds * 1000;
    }
  }

  // 3º: Campo date genérico
  const d = order.date;
  if (d) {
    if (typeof d === 'number' && !isNaN(d) && d > 0) return d;
    if (typeof d === 'string') {
      const t = new Date(d).getTime();
      if (!isNaN(t) && t > 0) return t;
    }
  }

  // 4º: Se o ID contiver timestamp numérico de geração
  if (typeof order.id === 'string') {
    const match = order.id.match(/\d{10,13}/);
    if (match) {
      const parsed = parseInt(match[0], 10);
      if (!isNaN(parsed) && parsed > 1000000000) {
        return parsed < 10000000000 ? parsed * 1000 : parsed;
      }
    }
  }

  return 0;
}

/**
 * Normaliza texto removendo acentos, pontuação redundante e padronizando em maiúsculas ou minúsculas.
 */
export function normalizeText(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normaliza qualquer valor de técnico convertendo estritamente para MAIÚSCULAS
 * e removendo acentuações para padronização total na busca e indexação.
 */
export function normalizeToUpper(str: string | undefined | null): string {
  if (!str) return '';
  return normalizeText(String(str)).toUpperCase();
}

/**
 * Compara se um valor de técnico (campo string em registro ou OS) corresponde ao técnico-alvo.
 * Transforma todas as letras em MAIÚSCULAS e remove acentos para garantir busca sem falhas.
 */
export function matchesTechnician(
  techField: string | undefined | null,
  targetTechNameOrId: string | undefined | null,
  allTechs: { id?: string; name: string }[] = []
): boolean {
  if (!techField || !targetTechNameOrId) return false;
  const rawField = String(techField).trim().toUpperCase();
  const rawTarget = String(targetTechNameOrId).trim().toUpperCase();
  if (!rawField || !rawTarget) return false;

  // 1. Igualdade estrita em MAIÚSCULAS
  if (rawField === rawTarget) return true;

  // 2. Normalização sem acentos em MAIÚSCULAS
  const normField = normalizeToUpper(rawField);
  const normTarget = normalizeToUpper(rawTarget);
  if (normField && normTarget && normField === normTarget) return true;

  // 3. Resolução via lista de técnicos (ID -> Nome ou Nome -> ID em MAIÚSCULAS)
  const targetObj = allTechs.find(t => 
    (t.id && t.id.toUpperCase() === rawTarget) || 
    normalizeToUpper(t.name) === normTarget
  );

  if (targetObj) {
    if (targetObj.id && rawField === targetObj.id.toUpperCase()) return true;
    if (targetObj.name && normalizeToUpper(rawField) === normalizeToUpper(targetObj.name)) return true;
  }

  const fieldObj = allTechs.find(t => 
    (t.id && t.id.toUpperCase() === rawField) || 
    normalizeToUpper(t.name) === normField
  );

  if (fieldObj) {
    if (fieldObj.name && normalizeToUpper(fieldObj.name) === normTarget) return true;
    if (targetObj && fieldObj.id && targetObj.id && fieldObj.id.toUpperCase() === targetObj.id.toUpperCase()) return true;
  }

  return false;
}

/**
 * Ordena ordens de serviço estritamente pela data de criação original (da mais recente para a mais antiga).
 */
export function sortOrdersByCreationDateDesc<T extends { id?: string }>(ordersList: T[]): T[] {
  return [...ordersList].sort((a, b) => {
    const timeA = getOrderCreationTimestamp(a);
    const timeB = getOrderCreationTimestamp(b);
    if (timeB !== timeA) {
      return timeB - timeA; // Mais recente primeiro
    }
    return String(b.id || '').localeCompare(String(a.id || ''));
  });
}

