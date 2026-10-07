import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  setPersistence, 
  browserLocalPersistence,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  doc, 
  getDocFromServer 
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Adicionando persistência para não deslogar ao atualizar a página
setPersistence(auth, browserLocalPersistence);

// Helper to ensure username is treated as email for Firebase Auth
const ensureEmailFormat = (input: string) => {
  if (input.includes('@')) return input.trim().toLowerCase();
  return `${input.trim().toLowerCase()}@lefrio.com`;
};

export async function signIn(usernameOrEmail: string, pass: string) {
  try {
    const email = ensureEmailFormat(usernameOrEmail);
    const result = await signInWithEmailAndPassword(auth, email, pass);
    return result.user;
  } catch (error: any) {
    console.error('Error signing in:', error);
    let message = 'Erro ao entrar no sistema.';
    if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      message = 'Usuário ou senha incorretos.';
    } else if (error.code === 'auth/operation-not-allowed') {
      message = 'O login por e-mail e senha não está habilitado no Console do Firebase. Vá em "Authentication -> Sign-in method" e ative "Email/Password".';
    } else if (error.code === 'auth/network-request-failed') {
      message = 'Erro de conexão. Verifique sua internet.';
    }
    throw new Error(message);
  }
}

export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    console.error('Error signing in with Google:', error);
    throw error;
  }
}

async function testConnection() {
  try {
    // Attempt to read a dummy document to test connection
    await getDocFromServer(doc(db, 'system', 'connection-test'));
    console.log('Firebase connection successful');
  } catch (error: any) {
    if (error?.message?.includes('the client is offline')) {
      console.error('Please check your Firebase configuration or internet connection.');
    } else {
      // It's okay if the document doesn't exist, as long as it's not a connection error
      console.log('Firebase connected (doc might not exist)');
    }
  }
}

testConnection();
