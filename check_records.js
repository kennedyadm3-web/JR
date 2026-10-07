import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

const app = initializeApp({}); // Mock won't work, wait, the db is accessed in dataService.ts
