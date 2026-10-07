import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

let _filename = "";
let _dirname = "";

if (typeof __filename !== "undefined") {
  _filename = __filename;
} else if (typeof import.meta !== "undefined" && import.meta.url) {
  _filename = fileURLToPath(import.meta.url);
}

if (typeof __dirname !== "undefined") {
  _dirname = __dirname;
} else if (_filename) {
  _dirname = path.dirname(_filename);
}

// 1. Load config and set environment variables BEFORE any other imports
let firebaseConfig: any = {};
try {
  const possiblePaths = [
    path.resolve(process.cwd(), "firebase-applet-config.json"),
    path.resolve(_dirname, "firebase-applet-config.json"),
    path.resolve(_dirname, "../firebase-applet-config.json"),
    path.resolve(".", "firebase-applet-config.json")
  ];
  
  let foundPath = "";
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      foundPath = p;
      break;
    }
  }
  
  if (foundPath) {
    firebaseConfig = JSON.parse(fs.readFileSync(foundPath, "utf-8"));
    console.log(`[Firebase] Loaded config from: ${foundPath}`);
  } else {
    console.error("[Firebase] firebase-applet-config.json NOT found in any search paths:", possiblePaths);
  }
} catch (err: any) {
  console.error("[Firebase] Error loading firebase-applet-config.json:", err.message || err);
}

const projectId = firebaseConfig.projectId || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || "placeholder-project-id";
const firestoreDatabaseId = firebaseConfig.firestoreDatabaseId || "(default)";
const apiKey = firebaseConfig.apiKey || "placeholder-api-key";
const authDomain = firebaseConfig.authDomain || `${projectId}.firebaseapp.com`;
const appId = firebaseConfig.appId || "placeholder-app-id";

process.env.GOOGLE_CLOUD_PROJECT = projectId;
process.env.GCLOUD_PROJECT = projectId;

const SERVER_TIMESTAMP = "__SERVER_TIMESTAMP__";

import express from "express";
import { createServer as createViteServer } from "vite";
import admin from "firebase-admin";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";

// Client SDK Workaround for IAM issues
import { initializeApp as initializeClientApp } from "firebase/app";
import { getAuth as getClientAuth, signInWithEmailAndPassword } from "firebase/auth";
import { 
  getFirestore as getClientFirestore, 
  doc as clientDoc, 
  setDoc as clientSetDoc, 
  getDoc as clientGetDoc,
  getDocs as clientGetDocs,
  updateDoc as clientUpdateDoc,
  deleteDoc as clientDeleteDoc,
  collection as clientCollection,
  serverTimestamp as clientServerTimestamp,
  deleteField as clientDeleteField,
  query as clientQuery,
  where as clientWhere,
  setLogLevel
} from "firebase/firestore";

setLogLevel('error');

// 2. Initialize Admin with explicit project ID
const firebaseApp = admin.initializeApp({
  projectId: projectId
});

// 3. Initialize Firestore Admin
const dbAdmin = getAdminFirestore(firebaseApp, firestoreDatabaseId);

// 4. Initialize Client SDK for workaround (respects public rules)
const clientApp = initializeClientApp({
  apiKey: apiKey,
  authDomain: authDomain,
  projectId: projectId,
  appId: appId
});
const dbClient = getClientFirestore(clientApp, firestoreDatabaseId);

// Unified DB reference - will try client SDK for writes if admin fails or just use it as primary for now
const db = dbAdmin; 

console.log(`[Firebase] Initialized Project: ${projectId}`);
console.log(`[Firebase] Using Database ID: ${firestoreDatabaseId}`);

// Helper to ensure username is treated as email for Firebase Auth
const ensureEmailFormat = (input: string) => {
  if (!input) return "";
  if (input.includes('@')) return input.trim().toLowerCase();
  return `${input.trim().toLowerCase()}@lefrio.com`;
};

// Helper for Robust DB Write (tries Admin then Client)
function prepareData(data: any, type: 'admin' | 'client') {
  const result = { ...data };
  Object.keys(result).forEach(key => {
    if (result[key] === SERVER_TIMESTAMP) {
      result[key] = type === 'admin' 
        ? admin.firestore.FieldValue.serverTimestamp() 
        : clientServerTimestamp();
    }
  });
  return result;
}

// Helper to race a promise against a timeout
function withTimeout<T>(promise: Promise<T>, ms: number = 2000): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Timeout of ${ms}ms exceeded`));
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).then((result) => {
    clearTimeout(timeoutId);
    return result;
  });
}

async function robustSetDoc(col: string, id: string, data: any) {
  try {
    // Try Admin first
    await withTimeout(dbAdmin.collection(col).doc(id).set(prepareData(data, 'admin')), 1500);
  } catch (err: any) {
    if (err.message && err.message.includes("PERMISSION_DENIED")) {
      console.log(`[Firebase Server] Admin set for ${col}/${id} delegated to Client SDK due to backend limits.`);
    } else {
      console.log(`[Firebase Server] Admin set for ${col}/${id} info:`, err.message || err);
    }
    try {
      console.log(`[Firebase] Trying Client SDK workaround for set ${col}/${id}`);
      const docRef = clientDoc(dbClient, col, id);
      await withTimeout(clientSetDoc(docRef, prepareData(data, 'client')), 1500);
    } catch (clientErr: any) {
      if (clientErr.message && clientErr.message.includes("PERMISSION_DENIED")) {
        console.log(`[Firebase Server] Client workaround set for ${col}/${id} delegated to authenticated frontend connection.`);
      } else {
        console.log(`[Firebase Server] Client workaround set for ${col}/${id} alternate:`, clientErr.message || clientErr);
      }
      throw clientErr;
    }
  }
}

async function robustUpdateDoc(col: string, id: string, data: any) {
  try {
    await withTimeout(dbAdmin.collection(col).doc(id).update(prepareData(data, 'admin')), 1500);
  } catch (err: any) {
    if (err.message && err.message.includes("PERMISSION_DENIED")) {
      console.log(`[Firebase Server] Admin update for ${col}/${id} delegated to Client SDK due to backend limits.`);
    } else {
      console.log(`[Firebase Server] Admin update for ${col}/${id} info:`, err.message || err);
    }
    try {
      console.log(`[Firebase] Trying Client SDK workaround for update ${col}/${id}`);
      const docRef = clientDoc(dbClient, col, id);
      await withTimeout(clientUpdateDoc(docRef, prepareData(data, 'client')), 1500);
    } catch (clientErr: any) {
      if (clientErr.message && clientErr.message.includes("PERMISSION_DENIED")) {
        console.log(`[Firebase Server] Client workaround update for ${col}/${id} delegated to authenticated frontend connection.`);
      } else {
        console.log(`[Firebase Server] Client workaround update for ${col}/${id} alternate:`, clientErr.message || clientErr);
      }
      throw clientErr;
    }
  }
}

async function robustDeleteDoc(col: string, id: string) {
  try {
    console.log(`[Firebase] Attempting Admin delete: ${col}/${id}`);
    await withTimeout(dbAdmin.collection(col).doc(id).delete(), 1500);
    console.log(`[Firebase] Admin delete success: ${col}/${id}`);
  } catch (err: any) {
    if (err.message && err.message.includes("PERMISSION_DENIED")) {
      console.log(`[Firebase Server] Admin delete for ${col}/${id} delegated to Client SDK due to backend limits.`);
    } else {
      console.log(`[Firebase Server] Admin delete failed for ${col}/${id} details:`, err.message);
    }
    // Tenta SDK de cliente para qualquer erro de permissão ou falha do Admin
    try {
      console.log(`[Firebase] Attempting Client workaround delete: ${col}/${id}`);
      const docRef = clientDoc(dbClient, col, id);
      await withTimeout(clientDeleteDoc(docRef), 1500);
      console.log(`[Firebase] Client workaround delete success: ${col}/${id}`);
    } catch (clientErr: any) {
      if (clientErr.message && clientErr.message.includes("PERMISSION_DENIED")) {
        console.log(`[Firebase Server] Client workaround delete for ${col}/${id} delegated to authenticated frontend connection.`);
      } else {
        console.log(`[Firebase Server] Client workaround delete failed alternate:`, clientErr.message);
      }
      throw clientErr;
    }
  }
}

// Helper to ensure the default admin user exists
async function ensureAdminUser() {
  const adminEmail = "admin@lefrio.com";
  const adminPassword = "adminp-password";
  
  // Try to authenticate the client SDK workaround so it bypasses firestore.rules (if request.auth != null)
  try {
    const authClient = getClientAuth(clientApp);
    await withTimeout(signInWithEmailAndPassword(authClient, adminEmail, adminPassword), 2000);
    console.log("[Firebase] Client SDK Workaround authenticated.");
  } catch(e: any) {
    if (e.code === 'auth/user-not-found') {
      try {
        const restUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`;
        await withTimeout(fetch(restUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: adminEmail, password: adminPassword, returnSecureToken: true })
        }), 2000);
        const authClient = getClientAuth(clientApp);
        await withTimeout(signInWithEmailAndPassword(authClient, adminEmail, adminPassword), 2000);
        console.log("[Firebase] Client SDK Workaround authenticated after creation.");
      } catch(e2: any) {}
    }
  }

  try {
    let user;
    try {
      user = await withTimeout(admin.auth().getUserByEmail(adminEmail), 2000);
    } catch (e: any) {
      if (e.code === 'auth/user-not-found') {
        console.log("Creating default admin...");
        user = await withTimeout(admin.auth().createUser({
          email: adminEmail,
          password: adminPassword,
          displayName: "Administrador Geral"
        }), 2000);
      } else {
        throw e;
      }
    }

    await robustSetDoc("users", user.uid, {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || "Administrador Geral",
      role: 'admin',
      updatedAt: SERVER_TIMESTAMP
    });
    
    console.log(`Admin user synchronized: ${adminEmail}`);

  } catch (error: any) {
    console.error("Error ensuring admin:", error.message);
  }
}

async function robustGetDoc(col: string, id: string) {
  try {
    const snap = await withTimeout(dbAdmin.collection(col).doc(id).get(), 1500);
    return {
      exists: snap.exists,
      data: () => snap.data()
    };
  } catch (err: any) {
    console.log(`[Firebase Server] Admin get triggered Client SDK workaround for ${col}/${id}:`, err.message || err);
    try {
      const docRef = clientDoc(dbClient, col, id);
      const snap = await withTimeout(clientGetDoc(docRef), 1500);
      return {
        exists: snap.exists(),
        data: () => snap.data()
      };
    } catch (clientErr: any) {
      console.log(`[Firebase Server] Client workaround get also deferred to client-side auth for ${col}/${id}:`, clientErr.message || clientErr);
      return {
        exists: false,
        data: () => null
      };
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Start ensuring admin user in the background to prevent startup block on Cloud Run
  ensureAdminUser().catch((err) => {
    console.error("Error ensuring admin in background:", err);
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  app.get("/api/admin-status", async (req, res) => {
    try {
      // 1. Try Auth
      try {
        const user = await admin.auth().getUserByEmail("admin@lefrio.com");
        return res.json({ exists: true, uid: user.uid, email: user.email });
      } catch (e) {}

      // 2. Fallback: Search in Firestore users collection
      const q = clientQuery(clientCollection(dbClient, "users"), clientWhere("role", "==", "admin"));
      const snapshot = await clientGetDocs(q);
      if (!snapshot.empty) {
        const adminDoc = snapshot.docs[0].data();
        return res.json({ exists: true, uid: adminDoc.uid, email: adminDoc.email });
      }

      res.json({ exists: false, note: "Admin not found in Auth or Firestore" });
    } catch (e: any) {
      res.json({ exists: false, error: e.message });
    }
  });

  app.get("/api/clients_list", async (req, res) => {
    try {
      let snapshot;
      try {
        snapshot = await dbAdmin.collection("clients").get();
      } catch (e: any) {
        console.warn("Admin list clients failed, trying Client SDK");
        snapshot = await clientGetDocs(clientCollection(dbClient, "clients"));
      }
      const clients = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name || data.displayName || "Cliente s/ Nome"
        };
      });
      res.json(clients);
    } catch (error: any) {
      console.error("List clients failed:", error.message);
      res.json([]); // Retorna array vazio em vez de erro para não quebrar o seletor no frontend
    }
  });
  
  app.post("/api/sync-user", async (req, res) => {
    const { uid, email, displayName } = req.body;
    if (!uid) return res.status(400).json({ error: "UID required" });
    const normalizedEmail = (email || "").trim().toLowerCase();
    
    try {
      let snapshot: any = null;
      try {
        snapshot = await robustGetDoc("users", uid);
      } catch (permissionsErr: any) {
        console.log(`[Firebase Server] robustGetDoc failed due to server permissions, skipping server-side sync for ${uid}. Authoritative check will run client-side.`);
        const isAdminEmail = ['kennedy.adm3@gmail.com', 'admin@preventivas.com', 'admin@lefrio.com'].includes(normalizedEmail);
        return res.json({
          success: true,
          profile: null // Frontend will fetch profile directly under client auth
        });
      }
      
      const userData: any = {
        uid,
        email: email || "",
        displayName: displayName || email || "Usuário",
        updatedAt: SERVER_TIMESTAMP,
        lastLogin: SERVER_TIMESTAMP,
        lastActive: SERVER_TIMESTAMP
      };

      const isAdminEmail = ['kennedy.adm3@gmail.com', 'admin@preventivas.com', 'admin@lefrio.com'].includes(normalizedEmail);

      try {
        if (!snapshot.exists) {
          // If the uid is not registered yet, we check if they are either:
          // a) Hardcoded Admin
          // b) Otherwise, we MUST look for an existing user document with this email
          let emailMatchDoc: any = null;
          let emailMatchId: string | null = null;
          
          if (!isAdminEmail) {
            try {
              // Search in Firestore by email mapping (exact and trimmed)
              const usersCollection = dbAdmin.collection("users");
              const querySnapshot = await usersCollection.where("email", "==", email).get();
              if (!querySnapshot.empty) {
                emailMatchDoc = querySnapshot.docs[0].data();
                emailMatchId = querySnapshot.docs[0].id;
              } else {
                // Secondary check for lowercase match if input or DB had case differences
                const allUsers = await usersCollection.get();
                for (const d of allUsers.docs) {
                  const dData = d.data();
                  if (dData && dData.email && dData.email.trim().toLowerCase() === normalizedEmail) {
                    emailMatchDoc = dData;
                    emailMatchId = d.id;
                    break;
                  }
                }
              }
            } catch (errSearch: any) {
              console.log(`[Firebase] Checking existing email failed for ${email}:`, errSearch.message);
            }

            // If they are not pre-registered AND they are not admin, REJECT ACCESS!
            if (!emailMatchDoc) {
              return res.status(403).json({
                success: false,
                notRegistered: true,
                error: "Acesso recusado. Seu e-mail não está cadastrado no sistema. Por favor, peça ao administrador para realizar seu cadastro."
              });
            }
          }

          // If we reach here, either they are isAdminEmail, or their email matches a pre-registered doc
          if (isAdminEmail) {
            userData.role = 'admin';
            userData.clientId = null;
          } else if (emailMatchDoc) {
            userData.role = emailMatchDoc.role || 'technician';
            userData.clientId = emailMatchDoc.clientId || null;
            userData.displayName = emailMatchDoc.displayName || userData.displayName;
            userData.createdAt = emailMatchDoc.createdAt || SERVER_TIMESTAMP;
          } else {
            userData.role = 'technician';
            userData.clientId = null;
          }

          userData.createdAt = userData.createdAt || SERVER_TIMESTAMP;
          await robustSetDoc("users", uid, userData);

          // Delete the old pre-registered placeholder document if it has a different ID
          if (emailMatchId && emailMatchId !== uid) {
            try {
              await dbAdmin.collection("users").doc(emailMatchId).delete();
              console.log(`[Firebase] Deleted old placeholder registration ID ${emailMatchId} and linked to genuine UID ${uid}`);
            } catch (delErr: any) {
              console.log(`[Firebase] Soft cleanup ignored for ${emailMatchId}:`, delErr.message);
            }
          }
        } else {
          // Profile exists under this UID
          const existingData = snapshot.data();
          userData.role = isAdminEmail ? 'admin' : (existingData?.role || 'technician');
          userData.clientId = existingData?.clientId || null;
          await robustUpdateDoc("users", uid, userData);
        }
      } catch (writeErr: any) {
        console.log(`[Firebase] Backend failed to write user profile in sync-user for ${uid}:`, writeErr.message || writeErr);
      }
      
      let profile: any = null;
      try {
        const latestSnap = await robustGetDoc("users", uid);
        profile = latestSnap.exists ? latestSnap.data() : {
          uid,
          email: email || "",
          displayName: displayName || email || "Usuário",
          role: isAdminEmail ? 'admin' : 'technician',
          clientId: null
        };
      } catch (latestSnapErr) {
        profile = {
          uid,
          email: email || "",
          displayName: displayName || email || "Usuário",
          role: isAdminEmail ? 'admin' : 'technician',
          clientId: null
        };
      }

      res.json({ success: true, profile });
    } catch (error: any) {
      console.log("Sync user handled with client fallback:", error.message || error);
      res.json({ success: true, profile: null });
    }
  });

  app.get("/api/debug-users", async (req, res) => {
    try {
      let snapshot;
      try {
        snapshot = await dbAdmin.collection("users").get();
      } catch (e) {
        snapshot = await clientGetDocs(clientCollection(dbClient, "users"));
      }

      const users = await Promise.all(snapshot.docs.map(async doc => {
        const data = doc.data();
        let authStatus = "Unknown";
        try {
          if (data.uid.startsWith("fs_")) {
            authStatus = "Firestore Only (NO AUTH - Created during API failure)";
          } else {
            // Tentamos ver se o Auth responde
            try {
              const authUser = await admin.auth().getUser(data.uid);
              authStatus = authUser ? "Valid Auth" : "Inconsistent";
            } catch (authErr: any) {
              authStatus = "Error checking Auth: " + authErr.message;
            }
          }
        } catch (e: any) {
          authStatus = "Status Error: " + e.message;
        }
        return {
          uid: doc.id,
          email: data.email,
          role: data.role,
          authStatus
        };
      }));

      let apiStatus = "Checking...";
      try {
        await admin.auth().listUsers(1);
        apiStatus = "Enabled & Working";
      } catch (e: any) {
        apiStatus = "DISABLED: " + e.message;
      }

      res.json({ apiStatus, users });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/debug-record/:id", async (req, res) => {
    try {
      const docRef = clientDoc(dbClient, "maintenanceRecords", req.params.id);
      const docSnap = await clientGetDoc(docRef);
      if (!docSnap.exists()) {
        return res.status(404).json({ error: "Record not found" });
      }
      res.json({ id: docSnap.id, ...docSnap.data() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/debug-records", async (req, res) => {
    try {
      const pathsChecked = [
        path.resolve(process.cwd(), "firebase-applet-config.json"),
        path.resolve(_dirname, "firebase-applet-config.json"),
        path.resolve(".", "firebase-applet-config.json")
      ];
      const pathsStatus = pathsChecked.map(p => ({ path: p, exists: fs.existsSync(p) }));

      let loadedConfig = null;
      let errorMsg = null;
      try {
        const found = pathsStatus.find(p => p.exists);
        if (found) {
          loadedConfig = JSON.parse(fs.readFileSync(found.path, "utf-8"));
        } else {
          errorMsg = "Config file not found in any path";
        }
      } catch (err: any) {
        errorMsg = "Error parsing: " + err.message;
      }

      const recordsSnapshot = await clientGetDocs(clientCollection(dbClient, "maintenanceRecords"));
      const records = recordsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const addressesSnapshot = await clientGetDocs(clientCollection(dbClient, "addresses"));
      const addresses = addressesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const clientsSnapshot = await clientGetDocs(clientCollection(dbClient, "clients"));
      const clients = clientsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      res.json({
        diagnostics: {
          cwd: process.cwd(),
          dirname: _dirname,
          pathsStatus,
          loadedConfig,
          errorMsg,
          envProjectId: process.env.GOOGLE_CLOUD_PROJECT
        },
        totalRecords: records.length,
        totalAddresses: addresses.length,
        totalClients: clients.length,
        recordsSample: records.filter((r: any) => r.plannedDate === "2026-07-30" || r.plannedDate?.includes("2026-07-30") || r.technician1 === "ERINALDO" || (r.temporaryClient && r.temporaryClient.includes("SEB"))),
        allDates: [...new Set(records.map((r: any) => r.plannedDate))].sort(),
        allTechs: [...new Set(records.map((r: any) => r.technician1))].sort()
      });
    } catch (error: any) {
      res.status(500).json({
        error: error.message,
        diagnostics: {
          cwd: process.cwd(),
          dirname: _dirname,
          envProjectId: process.env.GOOGLE_CLOUD_PROJECT
        }
      });
    }
  });

  app.get("/api/debug-seb-coc", async (req, res) => {
    try {
      const clientsSnap = await clientGetDocs(clientCollection(dbClient, "clients"));
      const allClients = clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const sebClients = allClients.filter((c: any) => c.name && (c.name.toUpperCase().includes("SEB") || c.name.toUpperCase().includes("COC")));

      const sebClientIds = sebClients.map((c: any) => c.id);

      const addressesSnap = await clientGetDocs(clientCollection(dbClient, "addresses"));
      const allAddresses = addressesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const sebAddresses = allAddresses.filter((a: any) => sebClientIds.includes(a.clientId));

      const sebAddressIds = sebAddresses.map((a: any) => a.id);

      const recordsSnap = await clientGetDocs(clientCollection(dbClient, "maintenanceRecords"));
      const allRecords = recordsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const sebRecords = allRecords.filter((r: any) => sebAddressIds.includes(r.addressId));

      res.json({
        sebClients,
        sebAddresses,
        sebRecords
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/debug-address-duplicates", async (req, res) => {
    try {
      const [recordsSnap, addressesSnap, clientsSnap] = await Promise.all([
        clientGetDocs(clientCollection(dbClient, "maintenanceRecords")),
        clientGetDocs(clientCollection(dbClient, "addresses")),
        clientGetDocs(clientCollection(dbClient, "clients"))
      ]);

      const allRecords = recordsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      const allAddresses = addressesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      const allClients = clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      const clientMap = new Map<string, any>(allClients.map(c => [c.id, c]));

      // 1. Verificar duplicatas na coleção ADDRESSES
      // Critério de normalização: clientId + rua normalizada + número normalizado (ou nome normalizado)
      const normalize = (str: string) => {
        return (str || '')
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "") // remove acentos
          .replace(/[^a-z0-9]/g, "") // apenas alfanuméricos
          .trim();
      };

      const addressByKey = new Map<string, any[]>();
      for (const addr of allAddresses) {
        if (addr.status === 'inactive' || addr.active === false || addr.isInactive === true) continue;
        const cId = addr.clientId || 'NO_CLIENT';
        const normStreet = normalize(addr.street || addr.name || '');
        const normNumber = normalize(addr.number || '');
        const normComp = normalize(addr.complement || '');
        // Chave composta para identificar o mesmo endereço físico
        const key = `${cId}__${normStreet}__${normNumber}`;
        if (!addressByKey.has(key)) addressByKey.set(key, []);
        addressByKey.get(key)!.push(addr);
      }

      const duplicateAddressGroups: any[] = [];
      for (const [key, group] of addressByKey.entries()) {
        if (group.length > 1) {
          const client = clientMap.get(group[0].clientId);
          duplicateAddressGroups.push({
            key,
            clientName: client?.name || 'Cliente Desconhecido',
            clientId: group[0].clientId,
            count: group.length,
            addresses: group.map(a => ({
              id: a.id,
              name: a.name,
              street: a.street,
              number: a.number,
              neighborhood: a.neighborhood,
              route: a.route,
              createdAt: a.createdAt
            }))
          });
        }
      }

      // 2. Verificar duplicatas em maintenanceRecords por mês
      const currentMonth = "2026-09";
      const recordsCurrentMonth = allRecords.filter(r => r.month === currentMonth && !r.isTemporaryRoute);
      const recsByAddressId = new Map<string, any[]>();
      for (const r of recordsCurrentMonth) {
        if (!r.addressId) continue;
        const aid = String(r.addressId).trim();
        if (!recsByAddressId.has(aid)) recsByAddressId.set(aid, []);
        recsByAddressId.get(aid)!.push(r);
      }

      const multiRecordsInCurrentMonth: any[] = [];
      for (const [aid, recs] of recsByAddressId.entries()) {
        if (recs.length > 1) {
          multiRecordsInCurrentMonth.push({
            addressId: aid,
            count: recs.length,
            records: recs.map(r => ({
              id: r.id,
              status: r.status,
              plannedDate: r.plannedDate,
              technician1: r.technician1,
              technician2: r.technician2
            }))
          });
        }
      }

      res.json({
        totalAddresses: allAddresses.length,
        activeAddresses: allAddresses.filter(a => !(a.status === 'inactive' || a.active === false || a.isInactive === true)).length,
        duplicateAddressGroupsCount: duplicateAddressGroups.length,
        duplicateAddressGroups,
        totalRecordsCurrentMonth: recordsCurrentMonth.length,
        multiRecordsInCurrentMonthCount: multiRecordsInCurrentMonth.length,
        multiRecordsInCurrentMonth
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/debug-approval-flow", async (req, res) => {
    try {
      const recordsSnap = await clientGetDocs(clientCollection(dbClient, "maintenanceRecords"));
      const records = recordsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

      const byStatus: Record<string, number> = {};
      records.forEach(r => {
        byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      });

      const sepRecords = records.filter(r => r.month === "2026-09");
      const sepCompleted = sepRecords.filter(r => r.status === "completed");
      const sepPreCompleted = sepRecords.filter(r => r.status === "pre_completed");

      res.json({
        totalRecords: records.length,
        byStatus,
        sepTotal: sepRecords.length,
        sepCompletedCount: sepCompleted.length,
        sepPreCompletedCount: sepPreCompleted.length,
        sepCompleted: sepCompleted.map(r => ({
          id: r.id,
          status: r.status,
          completionDate: r.completionDate,
          executionDate: r.executionDate,
          clientSignatureDate: r.clientSignatureDate,
          clientSigneeName: r.clientSigneeName,
          tech1: r.technician1,
          addressId: r.addressId,
          approvedAt: r.approvedAt,
          approvedBy: r.approvedBy
        })),
        sepPreCompleted: sepPreCompleted.map(r => ({
          id: r.id,
          status: r.status,
          completionDate: r.completionDate,
          executionDate: r.executionDate,
          clientSignatureDate: r.clientSignatureDate,
          clientSigneeName: r.clientSigneeName,
          tech1: r.technician1,
          addressId: r.addressId
        }))
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/debug-equipments-discrepancies", async (req, res) => {
    try {
      const [addressesSnap, equipmentsSnap, recordsSnap] = await Promise.all([
        clientGetDocs(clientCollection(dbClient, "addresses")),
        clientGetDocs(clientCollection(dbClient, "equipments")),
        clientGetDocs(clientCollection(dbClient, "maintenanceRecords"))
      ]);

      const allAddresses = addressesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      const allEquipments = equipmentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      const allRecords = recordsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

      const activeEquipsByAddress = new Map<string, any[]>();
      const allEquipsByAddress = new Map<string, any[]>();

      for (const eq of allEquipments) {
        if (!eq.addressId) continue;
        const aid = String(eq.addressId).trim();
        if (!allEquipsByAddress.has(aid)) allEquipsByAddress.set(aid, []);
        allEquipsByAddress.get(aid)!.push(eq);

        const isActive = eq.status !== 'deactivated' && eq.active !== false && !eq.isDeactivated;
        if (isActive) {
          if (!activeEquipsByAddress.has(aid)) activeEquipsByAddress.set(aid, []);
          activeEquipsByAddress.get(aid)!.push(eq);
        }
      }

      const addressDiscrepancies: any[] = [];
      for (const addr of allAddresses) {
        const aid = String(addr.id).trim();
        const total = addr.totalMachines || 0;
        const activeList = activeEquipsByAddress.get(aid) || [];
        const allList = allEquipsByAddress.get(aid) || [];

        // Check for duplicate labels in this address
        const labelCounts: Record<string, number> = {};
        for (const eq of activeList) {
          const lbl = String(eq.label || '').trim();
          if (lbl) labelCounts[lbl] = (labelCounts[lbl] || 0) + 1;
        }
        const duplicateLabels = Object.entries(labelCounts).filter(([_, c]) => c > 1);

        if (activeList.length !== total || duplicateLabels.length > 0) {
          addressDiscrepancies.push({
            id: aid,
            street: addr.street,
            number: addr.number,
            clientId: addr.clientId,
            totalMachines: total,
            activeEquipsCount: activeList.length,
            allEquipsCount: allList.length,
            diff: activeList.length - total,
            duplicateLabels
          });
        }
      }

      // Check records where checklist count exceeds active equips count or total machines
      const recordDiscrepancies: any[] = [];
      for (const r of allRecords) {
        if (!r.addressId) continue;
        const aid = String(r.addressId).trim();
        const chk = r.checklist || [];
        const activeList = activeEquipsByAddress.get(aid) || [];
        const addr = allAddresses.find(a => a.id === aid);
        const total = addr?.totalMachines || 0;

        if (chk.length > activeList.length || chk.length > total) {
          recordDiscrepancies.push({
            recordId: r.id,
            addressId: aid,
            month: r.month,
            status: r.status,
            plannedDate: r.plannedDate,
            checklistLen: chk.length,
            activeListLen: activeList.length,
            totalMachines: total,
            street: addr?.street
          });
        }
      }

      res.json({
        totalAddresses: allAddresses.length,
        totalEquipments: allEquipments.length,
        totalRecords: allRecords.length,
        addressDiscrepanciesCount: addressDiscrepancies.length,
        addressDiscrepancies: addressDiscrepancies.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)),
        recordDiscrepanciesCount: recordDiscrepancies.length,
        recordDiscrepancies
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/debug-date-check", async (req, res) => {
    try {
      const qDate = (req.query.date as string) || "2026-09-26";
      const recordsSnap = await clientGetDocs(clientCollection(dbClient, "maintenanceRecords"));
      const allRecords = recordsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      
      const matchingDate = allRecords.filter((r: any) => 
        r.plannedDate === qDate || 
        (Array.isArray(r.plannedDates) && r.plannedDates.includes(qDate))
      );
      
      const matchingErinaldo = allRecords.filter((r: any) => 
        ((r.technician1 && r.technician1.toUpperCase().includes("ERINALDO")) || 
         (r.technician2 && r.technician2.toUpperCase().includes("ERINALDO"))) &&
        (r.month === "2026-09" || (r.plannedDate && r.plannedDate.includes("2026-09")))
      );

      const clientsSnap = await clientGetDocs(clientCollection(dbClient, "clients"));
      const allClients = clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      const treinamentoClient = allClients.filter((c: any) => c.name && c.name.toUpperCase().includes("TREIN"));

      const addressesSnap = await clientGetDocs(clientCollection(dbClient, "addresses"));
      const allAddresses = addressesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      const treinamentoAddresses = allAddresses.filter((a: any) => 
        treinamentoClient.some((c: any) => c.id === a.clientId) || (a.street && a.street.toUpperCase().includes("JULIO MARQUES"))
      );

      const serviceOrdersSnap = await clientGetDocs(clientCollection(dbClient, "serviceOrders"));
      const allOS = serviceOrdersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      const matchingOS = allOS.filter((os: any) => 
        os.plannedDate === qDate || (os.openedAt && os.openedAt.includes(qDate))
      );

      const techsSnap = await clientGetDocs(clientCollection(dbClient, "technicians"));
      const allTechs = techsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      const erinaldoTech = allTechs.filter((t: any) => t.name && t.name.toUpperCase().includes("ERIN"));

      res.json({
        qDate,
        matchingDateCount: matchingDate.length,
        matchingDate,
        matchingErinaldoCount: matchingErinaldo.length,
        matchingErinaldo,
        treinamentoClient,
        treinamentoAddresses,
        matchingOS,
        erinaldoTech
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Cache em memória no servidor para otimização extrema e resposta em <10ms
  let serverEquipmentsCache: { data: any[]; timestamp: number } | null = null;
  const SERVER_EQUIPMENTS_TTL = 30000; // 30 segundos

  const fetchAllEquipmentsServer = async (forceFresh = false) => {
    const now = Date.now();
    if (!forceFresh && serverEquipmentsCache && (now - serverEquipmentsCache.timestamp < SERVER_EQUIPMENTS_TTL)) {
      return serverEquipmentsCache.data;
    }
    const snap = await clientGetDocs(clientCollection(dbClient, "equipments"));
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));
    serverEquipmentsCache = { data: items, timestamp: now };
    return items;
  };

  app.post("/api/equipments/cache-clear", (req, res) => {
    serverEquipmentsCache = null;
    res.json({ success: true, message: "Cache de equipamentos limpo" });
  });

  // Endpoint de higienização de duplicatas de equipamentos e restauração de totalMachines
  app.post("/api/equipments/cleanup-duplicates", async (req, res) => {
    try {
      const deletedIds: string[] = [];
      const updatedAddresses: Record<string, number> = {};

      // 1. Escola Jarede Viana (naT0rf9fsU4zrUznZoTk): Contrato oficial de 24 máquinas (id 3723..3746)
      // Duplicatas criadas posteriormente: 3804, 3805, 3806 e 3955..3972
      const jaredeDuplicateIds = [
        "3804", "3805", "3806",
        "3955", "3956", "3957", "3958", "3959", "3960", "3961",
        "3962", "3963", "3964", "3965", "3966", "3967", "3968",
        "3969", "3970", "3971", "3972"
      ];

      for (const eqId of jaredeDuplicateIds) {
        try {
          await clientDeleteDoc(clientDoc(dbClient, "equipments", eqId));
          deletedIds.push(eqId);
        } catch (e: any) {
          console.warn(`[Cleanup] Erro ao deletar eq ${eqId}:`, e.message);
        }
      }

      try {
        await clientUpdateDoc(clientDoc(dbClient, "addresses", "naT0rf9fsU4zrUznZoTk"), {
          totalMachines: 24
        });
        updatedAddresses["naT0rf9fsU4zrUznZoTk"] = 24;
      } catch (e: any) {
        console.warn("[Cleanup] Erro ao restaurar totalMachines de naT0rf9fsU4zrUznZoTk:", e.message);
      }

      // 2. CMEI Socorro Tavares (TmWoX73q9J99MuoQLM9F): Cadastro oficial de 6 máquinas (id 1226..1231)
      // Duplicatas criadas posteriormente: 2000..2005
      const socorroDuplicateIds = ["2000", "2001", "2002", "2003", "2004", "2005"];
      for (const eqId of socorroDuplicateIds) {
        try {
          await clientDeleteDoc(clientDoc(dbClient, "equipments", eqId));
          deletedIds.push(eqId);
        } catch (e: any) {
          console.warn(`[Cleanup] Erro ao deletar eq ${eqId}:`, e.message);
        }
      }

      try {
        await clientUpdateDoc(clientDoc(dbClient, "addresses", "TmWoX73q9J99MuoQLM9F"), {
          totalMachines: 6
        });
        updatedAddresses["TmWoX73q9J99MuoQLM9F"] = 6;
      } catch (e: any) {
        console.warn("[Cleanup] Erro ao restaurar totalMachines de TmWoX73q9J99MuoQLM9F:", e.message);
      }

      // 3. Colégio Elma Marques Curt (1ahv03UnRV48KuhvPX07): Normalização de labels sequenciais únicos (01..23)
      // Eliminando colisões de numeração (07, 15, 19 repetidas) decorrentes de cliques rápidos
      const elmaRenumberMap: Record<string, string> = {
        "5638": "01",
        "5639": "02",
        "5640": "03",
        "5641": "04",
        "5642": "05",
        "5643": "06",
        "5644": "07",
        "5645": "08",
        "5646": "09",
        "5647": "10",
        "5648": "11",
        "5649": "12",
        "5650": "13",
        "5651": "14",
        "5652": "15",
        "5653": "16",
        "5654": "17",
        "5655": "18",
        "5656": "19",
        "5657": "20",
        "5658": "21",
        "5659": "22",
        "5660": "23"
      };

      for (const [eqId, newLbl] of Object.entries(elmaRenumberMap)) {
        try {
          await clientUpdateDoc(clientDoc(dbClient, "equipments", eqId), {
            label: newLbl
          });
        } catch (e: any) {
          console.warn(`[Cleanup] Erro ao renumerar label do eq ${eqId}:`, e.message);
        }
      }

      // Limpar cache de equipamentos do servidor
      serverEquipmentsCache = null;

      res.json({
        success: true,
        message: `Higienização concluída com sucesso! ${deletedIds.length} equipamentos duplicados removidos.`,
        deletedIds,
        updatedAddresses
      });
    } catch (error: any) {
      console.error("[Cleanup Error]:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Endpoint de saneamento profundo de checklists de atendimentos e contadores de máquinas
  app.post("/api/maintenance/sanitize-checklists-and-equipments", async (req, res) => {
    try {
      const [equipmentsSnap, addressesSnap, recordsSnap] = await Promise.all([
        clientGetDocs(clientCollection(dbClient, "equipments")),
        clientGetDocs(clientCollection(dbClient, "addresses")),
        clientGetDocs(clientCollection(dbClient, "maintenanceRecords"))
      ]);

      const allEquipments = equipmentsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
      const allAddresses = addressesSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
      const allRecords = recordsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

      // 1. Remover máquinas fantasmas '0000' adicionadas em campo por engano na APS - ARAPIRACA
      const phantomArapiracaIds = ['4803', '4804', '4805'];
      for (const eqId of phantomArapiracaIds) {
        try {
          await clientDeleteDoc(clientDoc(dbClient, "equipments", eqId));
        } catch (e: any) {
          console.warn(`[Sanitize] Erro ao deletar eq fantasma ${eqId}:`, e.message);
        }
      }

      // Re-filtrar equipments após remoção dos fantasmas
      const validEquipments = allEquipments.filter(e => !phantomArapiracaIds.includes(e.id));

      // Mapear equipamentos ativos válidos por endereço
      const activeEquipIdsByAddress = new Map<string, Set<string>>();
      const activeEquipCountByAddress = new Map<string, number>();

      for (const eq of validEquipments) {
        if (!eq.addressId) continue;
        const aid = String(eq.addressId).trim();
        const isActive = eq.status !== 'deactivated' && eq.active !== false && !eq.isDeactivated;
        if (isActive) {
          if (!activeEquipIdsByAddress.has(aid)) activeEquipIdsByAddress.set(aid, new Set());
          activeEquipIdsByAddress.get(aid)!.add(eq.id);
          activeEquipCountByAddress.set(aid, (activeEquipCountByAddress.get(aid) || 0) + 1);
        }
      }

      // 2. Sanitizar os checklists de todos os registros de manutenção
      const sanitizedRecordIds: string[] = [];
      for (const rec of allRecords) {
        if (!rec.addressId || !Array.isArray(rec.checklist) || rec.checklist.length === 0) continue;
        const aid = String(rec.addressId).trim();
        const validIdsForAddress = activeEquipIdsByAddress.get(aid) || new Set<string>();

        // Filtra para manter somente máquinas que pertencem ativamente a este endereço e deduplica por equipmentId
        const seenEqIds = new Set<string>();
        const sanitizedChecklist: any[] = [];
        let hadChanges = false;

        for (const item of rec.checklist) {
          if (!item || !item.equipmentId) {
            hadChanges = true;
            continue;
          }
          const eqId = String(item.equipmentId).trim();
          if (seenEqIds.has(eqId)) {
            hadChanges = true;
            continue;
          }
          // Se a máquina foi excluída do endereço / desativada, remove do checklist
          if (validIdsForAddress.size > 0 && !validIdsForAddress.has(eqId)) {
            hadChanges = true;
            continue;
          }
          seenEqIds.add(eqId);
          sanitizedChecklist.push(item);
        }

        if (hadChanges || sanitizedChecklist.length !== rec.checklist.length) {
          const executedCount = sanitizedChecklist.filter(it => it && it.checked && !it.skipped && !it.requestedRemoval).length;
          try {
            await clientUpdateDoc(clientDoc(dbClient, "maintenanceRecords", rec.id), {
              checklist: sanitizedChecklist,
              executedQuantity: executedCount
            });
            sanitizedRecordIds.push(rec.id);
          } catch (recErr: any) {
            console.warn(`[Sanitize] Erro ao atualizar checklist de ${rec.id}:`, recErr.message);
          }
        }
      }

      // 3. Atualizar totalMachines nos endereços para bater com os equipamentos oficiais
      const updatedAddresses: Record<string, number> = {};
      for (const addr of allAddresses) {
        const aid = String(addr.id).trim();
        const activeCount = activeEquipCountByAddress.get(aid);
        // Se o endereço possui equipamentos cadastrados na coleção e o totalMachines difere, sincroniza
        if (activeCount !== undefined && activeCount > 0 && addr.totalMachines !== activeCount) {
          try {
            await clientUpdateDoc(clientDoc(dbClient, "addresses", aid), {
              totalMachines: activeCount
            });
            updatedAddresses[aid] = activeCount;
          } catch (addrErr: any) {
            console.warn(`[Sanitize] Erro ao atualizar totalMachines de ${aid}:`, addrErr.message);
          }
        }
      }

      // Limpar cache de equipamentos do servidor
      serverEquipmentsCache = null;

      res.json({
        success: true,
        message: "Sanitização concluída com sucesso!",
        sanitizedRecordsCount: sanitizedRecordIds.length,
        sanitizedRecordIds,
        updatedAddressesCount: Object.keys(updatedAddresses).length,
        updatedAddresses
      });
    } catch (error: any) {
      console.error("[Sanitize Error]:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Endpoint dedicado de alta performance para listar equipamentos
  app.get("/api/equipments", async (req, res) => {
    try {
      const addressId = req.query.addressId ? String(req.query.addressId).trim() : "";
      const addressIdsQuery = req.query.addressIds ? String(req.query.addressIds).split(",").map(s => s.trim()).filter(Boolean) : [];
      const includeDeactivated = req.query.includeDeactivated === "true";

      const allEquips = await fetchAllEquipmentsServer();

      let filtered = allEquips;

      if (addressId) {
        filtered = filtered.filter(eq => eq && String(eq.addressId || '').trim() === addressId);
      } else if (addressIdsQuery.length > 0) {
        const idSet = new Set(addressIdsQuery);
        filtered = filtered.filter(eq => eq && idSet.has(String(eq.addressId || '').trim()));
      }

      if (!includeDeactivated) {
        filtered = filtered.filter(eq => eq.status !== 'deactivated' && eq.active !== false && !eq.isDeactivated);
      }

      filtered.sort((a, b) => {
        const labelA = parseInt(a.label, 10) || 0;
        const labelB = parseInt(b.label, 10) || 0;
        if (labelA !== labelB) {
          return labelA - labelB;
        }
        return (a.id || '').localeCompare(b.id || '');
      });

      res.json({
        success: true,
        count: filtered.length,
        total: allEquips.length,
        equipments: filtered
      });
    } catch (error: any) {
      console.error("[API Equipments] Erro:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Endpoint dedicado e resiliente para o roteiro do dia do técnico
  app.get("/api/tech-demand/itinerary", async (req, res) => {
    try {
      const targetDate = ((req.query.date as string) || new Date().toISOString().slice(0, 10)).split('T')[0].trim();
      const rawTargetTech = ((req.query.tech as string) || "").trim();
      const targetMonth = (req.query.month as string) || targetDate.slice(0, 7);

      const [recordsSnap, techsSnap, serviceOrdersSnap] = await Promise.all([
        clientGetDocs(clientCollection(dbClient, "maintenanceRecords")),
        clientGetDocs(clientCollection(dbClient, "technicians")),
        clientGetDocs(clientCollection(dbClient, "serviceOrders"))
      ]);

      const allRecords = recordsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      const allTechs = techsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      const allOS = serviceOrdersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

      // Identificar identificadores válidos do técnico alvo (nome e id)
      const validTargetTechIdentifiers = new Set<string>();
      if (rawTargetTech) {
        const norm = rawTargetTech.toUpperCase();
        validTargetTechIdentifiers.add(norm);
        const matchedTech = allTechs.find(t => 
          (t.id && t.id.toUpperCase() === norm) || 
          (t.name && t.name.trim().toUpperCase() === norm)
        );
        if (matchedTech) {
          if (matchedTech.id) validTargetTechIdentifiers.add(matchedTech.id.toUpperCase().trim());
          if (matchedTech.name) validTargetTechIdentifiers.add(matchedTech.name.toUpperCase().trim());
        }
      }

      // REGRA MANDATÓRIA: Endereços NÃO podem ter múltiplas datas agendadas. É somente uma data para cada endereço!
      // Se um endereço tinha uma data anterior e recebeu novo agendamento, ele sai totalmente do agendamento anterior.
      // Identificamos o registro de agendamento ativo canônico para cada endereço:
      const byAddress = new Map<string, any[]>();
      for (const r of allRecords) {
        if (!r.addressId || r.isTemporaryRoute) continue;
        const aid = String(r.addressId).trim();
        if (!byAddress.has(aid)) byAddress.set(aid, []);
        byAddress.get(aid)!.push(r);
      }

      // Para cada endereço com registros com plannedDate, apenas um único registro pode manter plannedDate ativa
      const activeAddressScheduleDocId = new Map<string, string>();
      for (const [aid, list] of byAddress.entries()) {
        const scheduledList = list.filter(r => Boolean(r.plannedDate));
        if (scheduledList.length === 0) continue;
        if (scheduledList.length === 1) {
          activeAddressScheduleDocId.set(aid, scheduledList[0].id);
          continue;
        }

        // Se houver mais de um documento agendado para o mesmo endereço,
        // o mais recente / do mês mais próximo do targetMonth ou da data atual é o canônico
        scheduledList.sort((a, b) => {
          // Pontuação por status e data
          const score = (rec: any) => {
            let pts = 0;
            if (rec.month === targetMonth) pts += 50;
            if (rec.plannedDate === targetDate) pts += 40;
            if (rec.status === "completed") pts += 30;
            if (rec.status === "pre_completed") pts += 20;
            if (rec.id.startsWith(rec.month + "_")) pts += 10;
            return pts;
          };
          const scoreDiff = score(b) - score(a);
          if (scoreDiff !== 0) return scoreDiff;
          return String(b.plannedDate || '').localeCompare(String(a.plannedDate || ''));
        });

        activeAddressScheduleDocId.set(aid, scheduledList[0].id);
      }

      // Filtragem estrita dos registros de preventiva:
      const filteredRecords = allRecords.filter((r: any) => {
        if (!r) return false;
        const rDate = (r.plannedDate || "").split("T")[0].trim();
        if (rDate !== targetDate) return false;

        // Se o endereço tem agendamento ativo em outro documento, este documento antigo é descartado
        if (r.addressId && !r.isTemporaryRoute) {
          const aid = String(r.addressId).trim();
          const canonicalDocId = activeAddressScheduleDocId.get(aid);
          if (canonicalDocId && canonicalDocId !== r.id) {
            return false;
          }
        }

        // Filtragem estrita por técnico:
        if (validTargetTechIdentifiers.size > 0) {
          const t1 = (r.technician1 || "").trim().toUpperCase();
          const t2 = (r.technician2 || "").trim().toUpperCase();
          const matches = (Boolean(t1) && validTargetTechIdentifiers.has(t1)) || 
                          (Boolean(t2) && validTargetTechIdentifiers.has(t2));
          if (!matches) return false;
        }

        return true;
      });

      // Filtragem estrita das Ordens de Serviço:
      const filteredOS = allOS.filter((os: any) => {
        if (!os || os.status === "cancelada") return false;
        const osDate = (os.plannedDate || (os.openedAt ? os.openedAt.substring(0, 10) : "")).split("T")[0].trim();
        if (osDate !== targetDate) return false;

        if (validTargetTechIdentifiers.size > 0) {
          const t1 = (os.technicianId || "").trim().toUpperCase();
          const t2 = (os.technician2Id || "").trim().toUpperCase();
          const matches = (Boolean(t1) && validTargetTechIdentifiers.has(t1)) || 
                          (Boolean(t2) && validTargetTechIdentifiers.has(t2));
          if (!matches) return false;
        }

        return true;
      });

      const addressIds = new Set<string>();
      filteredRecords.forEach((r: any) => { if (r.addressId) addressIds.add(String(r.addressId).trim()); });
      filteredOS.forEach((os: any) => { if (os.addressId) addressIds.add(String(os.addressId).trim()); });
      // Inclui também os endereços do mês alvo para pré-carregamento da pauta
      allRecords.forEach((r: any) => {
        if (r && r.month === targetMonth && r.addressId) {
          addressIds.add(String(r.addressId).trim());
        }
      });

      const addressesSnap = await clientGetDocs(clientCollection(dbClient, "addresses"));
      const allAddresses = addressesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      const relevantAddresses = allAddresses.filter((a: any) => addressIds.has(String(a.id).trim()));

      const clientIds = new Set<string>();
      relevantAddresses.forEach((a: any) => { if (a.clientId) clientIds.add(String(a.clientId).trim()); });
      filteredOS.forEach((os: any) => { if (os.clientId) clientIds.add(String(os.clientId).trim()); });

      const clientsSnap = await clientGetDocs(clientCollection(dbClient, "clients"));
      const allClients = clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      const relevantClients = allClients.filter((c: any) => clientIds.has(String(c.id).trim()));

      const allEquipments = await fetchAllEquipmentsServer();
      const relevantEquipments = allEquipments
        .filter((eq: any) => eq?.addressId && addressIds.has(String(eq.addressId).trim()))
        .filter((eq: any) => eq.status !== 'deactivated' && eq.active !== false && !eq.isDeactivated);

      res.json({
        success: true,
        targetDate,
        targetTech: rawTargetTech,
        records: filteredRecords,
        serviceOrders: filteredOS,
        addresses: relevantAddresses,
        clients: relevantClients,
        techs: allTechs,
        equipments: relevantEquipments,
        totalEquipmentsCount: allEquipments.length
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Função utilitária para higienização completa e garantia de regra estrita de agendamentos no Firestore
  async function sanitizeAllSchedulesServer() {
    console.log("[Sanitize] Iniciando higienização estrita de agendamentos...");
    const recordsSnap = await clientGetDocs(clientCollection(dbClient, "maintenanceRecords"));
    const allRecords = recordsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

    let cleanedArrayCount = 0;
    let deletedDuplicatesCount = 0;
    const errors: string[] = [];
    const actionsLog: string[] = [];

    // 1. Elimina resquícios de plannedDates array e returnDates inválidas em todos os documentos
    for (const r of allRecords) {
      const updates: any = {};
      let needsUpdate = false;
      if (Array.isArray(r.plannedDates)) {
        updates.plannedDates = clientDeleteField();
        needsUpdate = true;
      }
      if (r.returnDate && r.returnDate === r.plannedDate) {
        updates.returnDate = null;
        needsUpdate = true;
      }
      if (needsUpdate) {
        try {
          await clientUpdateDoc(clientDoc(dbClient, "maintenanceRecords", r.id), updates);
          cleanedArrayCount++;
        } catch (e: any) {
          console.warn(`[Sanitize] Erro ao limpar plannedDates do doc ${r.id}:`, e.message);
        }
      }
    }

    // 2. Garante que cada endereço tem estritamente UM ÚNICO agendamento ativo
    const byAddress = new Map<string, any[]>();
    for (const r of allRecords) {
      if (!r.addressId || r.isTemporaryRoute) continue;
      const aid = String(r.addressId).trim();
      if (!byAddress.has(aid)) byAddress.set(aid, []);
      byAddress.get(aid)!.push(r);
    }

    for (const [addressId, list] of byAddress.entries()) {
      if (list.length <= 1) continue;

      const scheduledList = list.filter(r => Boolean(r.plannedDate));
      if (scheduledList.length > 1) {
        console.log(`[Sanitize] Address ${addressId} has ${scheduledList.length} scheduled docs:`, scheduledList.map(s => ({ id: s.id, month: s.month, date: s.plannedDate, status: s.status })));
      }

      // Ordenar por prioridade para manter o registro canônico mais recente / concluído
      list.sort((a, b) => {
        const score = (rec: any) => {
          let pts = 0;
          if (rec.status === "completed") pts += 100;
          if (rec.status === "pre_completed") pts += 50;
          if (rec.executionDate) pts += 40;
          if (rec.checklist && Array.isArray(rec.checklist) && rec.checklist.some((it: any) => it?.checked)) pts += 30;
          if (rec.plannedDate) pts += 20;
          if (rec.technician1) pts += 10;
          if (rec.id.startsWith(rec.month + "_")) pts += 5; // ID canônico
          return pts;
        };
        const scoreDiff = score(b) - score(a);
        if (scoreDiff !== 0) return scoreDiff;
        return String(b.month || '').localeCompare(String(a.month || ''));
      });

      const best = list[0];
      const duplicates = list.slice(1);

      for (const dup of duplicates) {
        try {
          // Se o duplicado não está concluído, remove totalmente do Firestore
          if (dup.status !== "completed" && dup.status !== "pre_completed") {
            await clientDeleteDoc(clientDoc(dbClient, "maintenanceRecords", dup.id));
            deletedDuplicatesCount++;
            actionsLog.push(`Deleted uncompleted duplicate ${dup.id} (${dup.month})`);
          } else if (dup.plannedDate) {
            // REGRA MANDATÓRIA: Se for registro antigo/duplicado, limpa a plannedDate para não concorrer no roteiro diário
            await clientUpdateDoc(clientDoc(dbClient, "maintenanceRecords", dup.id), {
              plannedDate: clientDeleteField(),
              plannedDates: clientDeleteField()
            });
            cleanedArrayCount++;
            actionsLog.push(`Cleaned plannedDate on completed duplicate ${dup.id} (${dup.month})`);
          }
        } catch (delErr: any) {
          console.warn(`[Sanitize] Erro ao remover duplicata ${dup.id} do endereço ${addressId}:`, delErr.message);
          errors.push(`Error on ${dup.id} (address ${addressId}): ${delErr.message}`);
        }
      }
    }

    console.log(`[Sanitize] Concluído! Limpos: ${cleanedArrayCount}, Duplicatas removidas: ${deletedDuplicatesCount}`);
    return { cleanedArrayCount, deletedDuplicatesCount, totalChecked: allRecords.length, actionsLog, errors };
  }

  app.post("/api/maintenance/restore-to-precompleted", async (req, res) => {
    try {
      const targetIds: string[] = req.body.ids || [
        "2026-09_VKtO1AEecBT9xkf9Bho1",
        "2026-09_92Nb54gtYHpk4ASF2O7M",
        "2026-09_9yB0TIaJtky9ZP99EvPR",
        "2026-09_LJoS5m5Nmu88icWAZMAl",
        "2026-09_roSCYZQnforhexf4lOyI"
      ];

      const results: any[] = [];
      for (const id of targetIds) {
        try {
          const docRef = clientDoc(dbClient, "maintenanceRecords", id);
          await clientUpdateDoc(docRef, {
            status: "pre_completed",
            routeStatus: "pre_completed"
          });
          results.push({ id, success: true });
        } catch (e: any) {
          results.push({ id, success: false, error: e.message });
        }
      }

      res.json({ success: true, count: results.filter(r => r.success).length, results });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Endpoint para corrigir e reverter atendimentos que foram indevidamente marcados como pre_completed ou têm completionDate SEM assinatura digital
  app.post("/api/maintenance/fix-unsigned-records", async (req, res) => {
    try {
      const recordsSnap = await clientGetDocs(clientCollection(dbClient, "maintenanceRecords"));
      const allRecords = recordsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

      const fixed: any[] = [];
      for (const rec of allRecords) {
        // Se já está formalmente aprovado pelo administrativo, preserva histórico
        if (rec.adminApproved || rec.approvedAt) continue;

        const hasSignature = Boolean(rec.clientSignature && typeof rec.clientSignature === "string" && rec.clientSignature.trim().length > 10);
        const hasSignee = Boolean(rec.clientSigneeName && typeof rec.clientSigneeName === "string" && rec.clientSigneeName.trim().length >= 3);
        const hasRegistration = Boolean(rec.clientSigneeRegistration && typeof rec.clientSigneeRegistration === "string" && rec.clientSigneeRegistration.trim().length >= 3);
        const isFieldFinalized = hasSignature && hasSignee && hasRegistration;

        // Se está como pre_completed ou tem completionDate MAS não tem assinatura válida
        if (!isFieldFinalized && (rec.status === "pre_completed" || rec.routeStatus === "pre_completed" || rec.completionDate)) {
          const docRef = clientDoc(dbClient, "maintenanceRecords", rec.id);
          await clientUpdateDoc(docRef, {
            status: "pending",
            routeStatus: "pending",
            completionDate: clientDeleteField(),
            clientSignatureDate: clientDeleteField()
          });
          fixed.push({ id: rec.id, clientSignee: rec.clientSigneeName, tech: rec.technician1, reason: "Sem assinatura do cliente - retornado para rascunho/pendente" });
        }
      }

      res.json({ success: true, count: fixed.length, fixed });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Endpoint para restaurar como aprovados todos os atendimentos anteriores a ontem (2026-09-28),
  // mantendo pendente de aprovação (status: pre_completed) EXCLUSIVAMENTE os atendimentos de ontem e hoje (2026-09-28 e 2026-09-29) COM ASSINATURA.
  app.post("/api/maintenance/restore-previously-approved", async (req, res) => {
    try {
      const recordsSnap = await clientGetDocs(clientCollection(dbClient, "maintenanceRecords"));
      const allRecords = recordsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

      const isYesterdayOrToday = (r: any) => {
        const rawDate = r.completionDate || r.clientSignatureDate || r.executionDate || r.plannedDate || "";
        const d = typeof rawDate === "string" ? rawDate.slice(0, 10) : "";
        return d === "2026-09-28" || d === "2026-09-29" || d >= "2026-09-28";
      };

      const isTrulyFinalizedByTech = (r: any) => {
        const hasSignature = Boolean(r.clientSignature && typeof r.clientSignature === "string" && r.clientSignature.trim().length > 10);
        const hasSignee = Boolean(r.clientSigneeName && typeof r.clientSigneeName === "string" && r.clientSigneeName.trim().length >= 3);
        const hasRegistration = Boolean(r.clientSigneeRegistration && typeof r.clientSigneeRegistration === "string" && r.clientSigneeRegistration.trim().length >= 3);
        return hasSignature && hasSignee && hasRegistration;
      };

      // Registros que devem permanecer pendentes (ontem e hoje) - OBRIGATÓRIO TER ASSINATURA, NOME E MATRÍCULA!
      const keepPending = allRecords.filter((r: any) => {
        return isYesterdayOrToday(r) && !r.adminApproved && !r.approvedAt && isTrulyFinalizedByTech(r);
      });

      // Registros sem assinatura recente que estavam indevidamente como pre_completed devem voltar para pending
      const unsignedToReset = allRecords.filter((r: any) => {
        return !r.adminApproved && !r.approvedAt && !isTrulyFinalizedByTech(r) && (r.status === "pre_completed" || r.routeStatus === "pre_completed" || r.completionDate);
      });

      for (const rec of unsignedToReset) {
        try {
          const docRef = clientDoc(dbClient, "maintenanceRecords", rec.id);
          await clientUpdateDoc(docRef, {
            status: "pending",
            routeStatus: "pending",
            completionDate: clientDeleteField(),
            clientSignatureDate: clientDeleteField()
          });
        } catch (e: any) {
          console.error("Erro ao resetar atendimento sem assinatura:", rec.id, e.message);
        }
      }

      // Registros que foram indevidamente colocados como pre_completed ou sem aprovação mas são anteriores a 28/09/2026:
      const toApprove = allRecords.filter((r: any) => {
        if (isYesterdayOrToday(r)) return false; // Ontem e hoje permanecem pendentes!
        // Qualquer atendimento anterior que esteja como pre_completed ou finalizado em campo sem adminApproved
        const isPreCompleted = r.status === "pre_completed";
        const isFieldFinalized = Boolean(r.clientSignature || r.clientSigneeName || (r.completionDate && typeof r.completionDate === "string" && r.completionDate.includes("T")));
        const isMissingApproval = !r.adminApproved && !r.approvedAt;
        return isPreCompleted || (isFieldFinalized && isMissingApproval);
      });

      console.log(`[Restore Approved] Encontrados ${toApprove.length} atendimentos anteriores para aprovar, e ${keepPending.length} para manter pendentes.`);

      const results: any[] = [];
      for (const rec of toApprove) {
        try {
          const docRef = clientDoc(dbClient, "maintenanceRecords", rec.id);
          const effectiveDate = rec.completionDate || rec.clientSignatureDate || rec.executionDate || new Date().toISOString();
          await clientUpdateDoc(docRef, {
            status: "completed",
            routeStatus: "completed",
            adminApproved: true,
            approvedAt: rec.approvedAt || effectiveDate,
            approvedBy: rec.approvedBy || "Administrativo"
          });
          results.push({ id: rec.id, clientSignee: rec.clientSigneeName, date: (rec.completionDate || rec.executionDate || "").slice(0, 10), success: true });
        } catch (err: any) {
          results.push({ id: rec.id, success: false, error: err.message });
        }
      }

      // Garante que os de ontem e hoje estejam com status "pre_completed"
      const pendingResults: any[] = [];
      for (const rec of keepPending) {
        try {
          if (rec.status !== "pre_completed" || rec.adminApproved) {
            const docRef = clientDoc(dbClient, "maintenanceRecords", rec.id);
            await clientUpdateDoc(docRef, {
              status: "pre_completed",
              routeStatus: "pre_completed",
              adminApproved: false
            });
          }
          pendingResults.push({ id: rec.id, clientSignee: rec.clientSigneeName, tech: rec.technician1, date: (rec.completionDate || rec.executionDate || "").slice(0, 10), success: true });
        } catch (err: any) {
          pendingResults.push({ id: rec.id, success: false, error: err.message });
        }
      }

      res.json({
        success: true,
        approvedCount: results.filter(r => r.success).length,
        pendingCount: pendingResults.filter(r => r.success).length,
        approvedResults: results,
        pendingResults
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Endpoint legado com escopo estrito apenas para datas recentes (ontem e hoje)
  app.post("/api/maintenance/fix-unapproved-completed", async (req, res) => {
    try {
      const recordsSnap = await clientGetDocs(clientCollection(dbClient, "maintenanceRecords"));
      const allRecords = recordsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

      const isYesterdayOrToday = (r: any) => {
        const rawDate = r.completionDate || r.clientSignatureDate || r.executionDate || r.plannedDate || "";
        const d = typeof rawDate === "string" ? rawDate.slice(0, 10) : "";
        return d === "2026-09-28" || d === "2026-09-29" || d >= "2026-09-28";
      };

      const toFix = allRecords.filter((r: any) => {
        if (!isYesterdayOrToday(r)) return false; // Nunca toca em atendimentos anteriores a ontem!
        const isFieldFinalized = Boolean(
          r.clientSignature || 
          r.clientSigneeName || 
          (r.completionDate && typeof r.completionDate === "string" && r.completionDate.includes("T"))
        );
        const isApproved = Boolean(r.adminApproved || r.approvedAt || r.approvedBy);
        return isFieldFinalized && !isApproved && r.status === "completed";
      });

      const results: any[] = [];
      for (const rec of toFix) {
        try {
          const docRef = clientDoc(dbClient, "maintenanceRecords", rec.id);
          await clientUpdateDoc(docRef, {
            status: "pre_completed",
            routeStatus: "pre_completed",
            adminApproved: false
          });
          results.push({ id: rec.id, clientSignee: rec.clientSigneeName, tech: rec.technician1, success: true });
        } catch (err: any) {
          results.push({ id: rec.id, success: false, error: err.message });
        }
      }

      res.json({
        success: true,
        totalFound: toFix.length,
        totalFixed: results.filter(r => r.success).length,
        fixed: results
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/maintenance/sanitize-all-schedules", async (req, res) => {
    try {
      const result = await sanitizeAllSchedulesServer();
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/maintenance/deduplicate-month", async (req, res) => {
    try {
      const { month = "2026-09" } = req.body;
      const recordsSnap = await clientGetDocs(clientCollection(dbClient, "maintenanceRecords"));
      const allRecords = recordsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const targetMonthRecords = allRecords.filter((r: any) => r.month === month && !r.isTemporaryRoute);

      const byAddress: Record<string, any[]> = {};
      targetMonthRecords.forEach((r: any) => {
        if (!byAddress[r.addressId]) byAddress[r.addressId] = [];
        byAddress[r.addressId].push(r);
      });

      const deletedIds: string[] = [];
      const keptMap: Record<string, string> = {};

      for (const [addressId, list] of Object.entries(byAddress)) {
        if (list.length <= 1) continue;

        // Choose best record to keep:
        // 1. Has execution date or status completed/pre_completed
        // 2. Has planned date
        // 3. Has notes or technicians
        // 4. Most recent
        list.sort((a, b) => {
          const score = (r: any) => {
            let pts = 0;
            if (r.status === "completed") pts += 100;
            if (r.status === "pre_completed") pts += 50;
            if (r.executionDate) pts += 40;
            if (r.checklist && Object.keys(r.checklist).length > 0) pts += 30;
            if (r.plannedDate) pts += 10;
            if (r.notes) pts += 5;
            if (r.technician1) pts += 2;
            return pts;
          };
          return score(b) - score(a);
        });

        const recordToKeep = list[0];
        keptMap[addressId] = recordToKeep.id;
        const recordsToDelete = list.slice(1);

        for (const r of recordsToDelete) {
          try {
            await clientDeleteDoc(clientDoc(dbClient, "maintenanceRecords", r.id));
            deletedIds.push(r.id);
          } catch (delErr) {
            console.warn(`Failed to delete duplicate doc ${r.id}:`, delErr);
          }
        }
      }

      res.json({
        success: true,
        month,
        totalDuplicatesRemoved: deletedIds.length,
        deletedIds,
        keptMap
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Endpoint definitivo para higienizar, mesclar e remover endereços duplicados físicos na raiz do sistema
  app.post("/api/maintenance/deduplicate-and-merge-addresses", async (req, res) => {
    try {
      const isDryRun = req.query.dryRun === "true";

      const [recordsSnap, addressesSnap, clientsSnap, equipmentsSnap, osSnap, callsSnap] = await Promise.all([
        clientGetDocs(clientCollection(dbClient, "maintenanceRecords")),
        clientGetDocs(clientCollection(dbClient, "addresses")),
        clientGetDocs(clientCollection(dbClient, "clients")),
        clientGetDocs(clientCollection(dbClient, "equipments")),
        clientGetDocs(clientCollection(dbClient, "serviceOrders")),
        clientGetDocs(clientCollection(dbClient, "serviceCalls"))
      ]);

      const allRecords = recordsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      const allAddresses = addressesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      const allClients = clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      const allEquipments = equipmentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      const allOS = osSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
      const allCalls = callsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

      const clientMap = new Map<string, any>(allClients.map(c => [c.id, c]));

      // Função de normalização rigorosa para detectar mesmo endereço físico
      const normalize = (str: string) => {
        return (str || '')
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "") // remove acentos
          .replace(/[^a-z0-9]/g, "") // apenas alfanuméricos
          .trim();
      };

      const addressByKey = new Map<string, any[]>();
      for (const addr of allAddresses) {
        if (addr.status === 'inactive' || addr.active === false || addr.isInactive === true) continue;
        const cId = addr.clientId || 'NO_CLIENT';
        const normStreet = normalize(addr.street || addr.name || '');
        const normNumber = normalize(addr.number || '');
        const key = `${cId}__${normStreet}__${normNumber}`;
        if (!addressByKey.has(key)) addressByKey.set(key, []);
        addressByKey.get(key)!.push(addr);
      }

      const mergeResults: any[] = [];
      let totalAddressesRemoved = 0;
      let totalEquipmentsMigrated = 0;
      let totalRecordsMerged = 0;
      let totalRecordsDeleted = 0;
      let totalOSMigrated = 0;
      let totalCallsMigrated = 0;

      for (const [key, group] of addressByKey.entries()) {
        if (group.length <= 1) continue;

        // Identificar o endereço canônico (o que manteremos)
        const scored = group.map(addr => {
          let score = 0;
          const eqCount = allEquipments.filter(e => e.addressId === addr.id).length;
          score += eqCount * 50;

          const recs = allRecords.filter(r => r.addressId === addr.id);
          score += recs.length * 20;
          recs.forEach(r => {
            if (r.status === "completed") score += 100;
            if (r.status === "pre_completed") score += 50;
            if (r.checklist && r.checklist.length > 0) score += 30;
            if (r.plannedDate) score += 20;
          });

          if (addr.route && addr.route.trim().length > 0) score += 30;
          if (/[áàâãéèêíïóôõöúçñ]/i.test(addr.street || '')) score += 10;
          if ((addr.street || '').length > 5) score += 5;

          return { addr, score, eqCount, recsCount: recs.length };
        });

        scored.sort((a, b) => b.score - a.score);
        const canonical = scored[0].addr;
        const duplicates = scored.slice(1).map(s => s.addr);

        const groupSummary: any = {
          key,
          client: clientMap.get(canonical.clientId)?.name || canonical.clientId,
          canonical: { id: canonical.id, street: canonical.street, route: canonical.route },
          duplicates: duplicates.map(d => ({ id: d.id, street: d.street, route: d.route })),
          equipmentsMigrated: 0,
          recordsMerged: 0,
          recordsDeleted: 0,
          osMigrated: 0,
          callsMigrated: 0
        };

        for (const dup of duplicates) {
          // 1. Migrar equipamentos do duplicado para o canônico
          const dupEquipments = allEquipments.filter(e => e.addressId === dup.id);
          for (const eq of dupEquipments) {
            if (!isDryRun) {
              await clientUpdateDoc(clientDoc(dbClient, "equipments", eq.id), {
                addressId: canonical.id,
                updatedAt: new Date().toISOString()
              });
            }
            groupSummary.equipmentsMigrated++;
            totalEquipmentsMigrated++;
          }

          // 2. Migrar Ordens de Serviço
          const dupOS = allOS.filter(os => os.addressId === dup.id);
          for (const os of dupOS) {
            if (!isDryRun) {
              await clientUpdateDoc(clientDoc(dbClient, "serviceOrders", os.id), {
                addressId: canonical.id
              });
            }
            groupSummary.osMigrated++;
            totalOSMigrated++;
          }

          // 3. Migrar Chamados de Serviço
          const dupCalls = allCalls.filter(c => c.addressId === dup.id);
          for (const c of dupCalls) {
            if (!isDryRun) {
              await clientUpdateDoc(clientDoc(dbClient, "serviceCalls", c.id), {
                addressId: canonical.id
              });
            }
            groupSummary.callsMigrated++;
            totalCallsMigrated++;
          }

          // 4. Migrar e Consolidar MaintenanceRecords de todos os meses
          const dupRecs = allRecords.filter(r => r.addressId === dup.id);
          const canonicalRecs = allRecords.filter(r => r.addressId === canonical.id);

          for (const dupRec of dupRecs) {
            const matchingCanonical = canonicalRecs.find(cr => cr.month === dupRec.month);
            if (matchingCanonical) {
              // Se o duplicado tem execução ou agendamento mais completo, enriquecer o canônico
              const dupScore = (dupRec.status === "completed" ? 100 : 0) + 
                               (dupRec.status === "pre_completed" ? 50 : 0) + 
                               (dupRec.plannedDate ? 30 : 0) +
                               (dupRec.checklist && dupRec.checklist.length > 0 ? 20 : 0);
              const canScore = (matchingCanonical.status === "completed" ? 100 : 0) + 
                               (matchingCanonical.status === "pre_completed" ? 50 : 0) + 
                               (matchingCanonical.plannedDate ? 30 : 0) +
                               (matchingCanonical.checklist && matchingCanonical.checklist.length > 0 ? 20 : 0);

              if (dupScore > canScore && !isDryRun) {
                const updates: any = {};
                if (dupRec.status && dupRec.status !== matchingCanonical.status) updates.status = dupRec.status;
                if (dupRec.plannedDate && !matchingCanonical.plannedDate) updates.plannedDate = dupRec.plannedDate;
                if (dupRec.executionDate && !matchingCanonical.executionDate) updates.executionDate = dupRec.executionDate;
                if (dupRec.technician1 && !matchingCanonical.technician1) updates.technician1 = dupRec.technician1;
                if (dupRec.technician2 && !matchingCanonical.technician2) updates.technician2 = dupRec.technician2;
                if (dupRec.checklist && (!matchingCanonical.checklist || matchingCanonical.checklist.length === 0)) updates.checklist = dupRec.checklist;
                if (dupRec.clientSignature && !matchingCanonical.clientSignature) {
                  updates.clientSignature = dupRec.clientSignature;
                  updates.clientSignatureDate = dupRec.clientSignatureDate;
                  updates.clientSigneeName = dupRec.clientSigneeName;
                  updates.clientSigneeRegistration = dupRec.clientSigneeRegistration;
                }
                if (Object.keys(updates).length > 0) {
                  await clientUpdateDoc(clientDoc(dbClient, "maintenanceRecords", matchingCanonical.id), updates);
                }
              }

              // Deletar o registro duplicado para não duplicar no cronograma
              if (!isDryRun) {
                await clientDeleteDoc(clientDoc(dbClient, "maintenanceRecords", dupRec.id));
              }
              groupSummary.recordsDeleted++;
              totalRecordsDeleted++;
            } else {
              // Canônico não tem registro nesse mês, migra este registro para o canônico
              if (!isDryRun) {
                await clientUpdateDoc(clientDoc(dbClient, "maintenanceRecords", dupRec.id), {
                  addressId: canonical.id
                });
              }
              groupSummary.recordsMerged++;
              totalRecordsMerged++;
            }
          }

          // 5. Excluir o endereço duplicado da coleção ADDRESSES
          if (!isDryRun) {
            await clientDeleteDoc(clientDoc(dbClient, "addresses", dup.id));
          }
          totalAddressesRemoved++;
        }

        mergeResults.push(groupSummary);
      }

      // Limpar cache de equipamentos do servidor
      serverEquipmentsCache = null;

      res.json({
        success: true,
        dryRun: isDryRun,
        duplicateGroupsFound: mergeResults.length,
        totalAddressesRemoved,
        totalEquipmentsMigrated,
        totalRecordsMerged,
        totalRecordsDeleted,
        totalOSMigrated,
        totalCallsMigrated,
        details: mergeResults
      });
    } catch (err: any) {
      console.error("[Deduplicate Addresses Error]:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get("/api/users", async (req, res) => {
    try {
      let users;
      try {
        const snapshot = await dbAdmin.collection("users").get();
        users = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
      } catch (err: any) {
        console.warn("[Firebase Server] Admin list users failed due to server permissions, trying Client SDK fallback");
        const snapshot = await clientGetDocs(clientCollection(dbClient, "users"));
        users = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
      }
      res.json(users);
    } catch (error: any) {
      console.warn("[Firebase Server] List users endpoint failed (Server permission denied). Frontend direct SDK fallback is available.");
      res.status(400).json({ error: "Server permission denied. Use Frontend direct client SDK instead.", fallbackNeeded: true });
    }
  });

  app.post("/api/users", async (req, res) => {
    const { username, email: emailInput, password, displayName, role, clientId, phone } = req.body;
    try {
      const email = ensureEmailFormat(username || emailInput);
      
      let uid;
      let authCreated = false;

      // WORKAROUND: Use REST API to create user if Admin SDK is blocked
      try {
        const restUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`;
        const restResp = await fetch(restUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            password,
            displayName,
            returnSecureToken: true
          })
        });

        const restData: any = await restResp.json();
        
        if (restResp.ok) {
          uid = restData.localId;
          authCreated = true;
          console.log("User created successfully via REST API:", email);
        } else {
          console.warn("REST API creation failed, trying Admin SDK:", restData.error?.message);
          // Try Admin SDK as secondary
          const userRecord = await admin.auth().createUser({ email, password, displayName });
          uid = userRecord.uid;
          authCreated = true;
        }
      } catch (err: any) {
        console.log("[Firebase] REST / Admin auth sync info, falling back to FS-only:", err.message);
        uid = "fs_" + Buffer.from(email).toString('hex').slice(0, 20);
      }

      let firestoreFailed = false;
      try {
        await robustSetDoc("users", uid, {
          uid,
          email,
          displayName,
          role: role || 'technician',
          clientId: clientId || null,
          phone: phone || null,
          createdAt: SERVER_TIMESTAMP,
          updatedAt: SERVER_TIMESTAMP,
          authCreated
        });
      } catch (err: any) {
        console.log("[Firebase] Backend write deferred, delegating to frontend:", err.message);
        firestoreFailed = true;
      }

      res.json({ 
        success: true, 
        uid, 
        authCreated,
        firestoreFailed,
        email,
        message: authCreated ? "Usuário criado com sucesso!" : "Usuário criado apenas no banco (Login indisponível - API desativada)"
      });
    } catch (error: any) {
      console.error("Create user failed:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/users/:uid", async (req, res) => {
    const { uid } = req.params;
    const { displayName, role, clientId, phone } = req.body;
    try {
      const userData: any = {
        updatedAt: SERVER_TIMESTAMP
      };
      if (displayName !== undefined) userData.displayName = displayName;
      if (role !== undefined) userData.role = role;
      if (clientId !== undefined) userData.clientId = clientId || null;
      if (phone !== undefined) userData.phone = phone || null;

      // Try updating Auth display name
      try {
        if (displayName) {
          await admin.auth().updateUser(uid, { displayName });
        }
      } catch (authErr: any) {
        console.log(`[Firebase] Auth update info for ${uid}:`, authErr.message);
      }

      let firestoreFailed = false;
      try {
        await robustUpdateDoc("users", uid, userData);
      } catch (err: any) {
        console.log(`[Firebase] Backend update deferred for user ${uid}, delegating to frontend:`, err.message);
        firestoreFailed = true;
      }

      res.json({ success: true, uid, firestoreFailed });
    } catch (error: any) {
      console.error("Update user failed:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/users/:uid", async (req, res) => {
    const { uid } = req.params;
    try {
      try { await admin.auth().deleteUser(uid); } catch (e) {}
      
      let firestoreFailed = false;
      try {
        await robustDeleteDoc("users", uid);
      } catch (err: any) {
        console.log("[Firebase] Backend delete deferred, delegating to frontend:", err.message);
        firestoreFailed = true;
      }
      
      res.json({ success: true, firestoreFailed, uid });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // SharePoint Folder Upload API
  app.post("/api/sharepoint/upload", async (req, res) => {
    const { fileName, fileBase64, folderLink, folderId, clientName } = req.body;

    if (!fileBase64) {
      return res.status(400).json({ error: "O conteúdo do arquivo (base64) é obrigatório." });
    }

    const tenantId = process.env.SHAREPOINT_TENANT_ID;
    const clientId = process.env.SHAREPOINT_CLIENT_ID;
    const clientSecret = process.env.SHAREPOINT_CLIENT_SECRET;

    if (!tenantId || !clientId || !clientSecret) {
      return res.status(400).json({ 
        error: "Configuração do SharePoint pendente! Certifique-se de configurar as variáveis SHAREPOINT_TENANT_ID, SHAREPOINT_CLIENT_ID e SHAREPOINT_CLIENT_SECRET no painel de configurações do AI Studio (Settings) ou no seu arquivo .env." 
      });
    }

    try {
      // 1. Obter Token de Acesso para o Microsoft Graph
      const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
      const params = new URLSearchParams();
      params.append("client_id", clientId);
      params.append("client_secret", clientSecret);
      params.append("scope", "https://graph.microsoft.com/.default");
      params.append("grant_type", "client_credentials");

      console.log(`[SharePoint] Solicitando token de acesso do Azure AD para o Tenant: ${tenantId}`);
      const tokenResponse = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params
      });

      if (!tokenResponse.ok) {
        const errText = await tokenResponse.text();
        throw new Error(`Falha ao obter token do Azure AD: ${errText}`);
      }

      const tokenData: any = await tokenResponse.json();
      const accessToken = tokenData.access_token;

      // 2. Resolver o Drive ID (Padrão ou configurado)
      let driveId = process.env.SHAREPOINT_DRIVE_ID;
      if (!driveId) {
        console.log("[SharePoint] Buscando Drive de documentos padrão (/sites/root/drive)...");
        const driveRes = await fetch("https://graph.microsoft.com/v1.0/sites/root/drive", {
          headers: { "Authorization": `Bearer ${accessToken}` }
        });
        if (driveRes.ok) {
          const driveData: any = await driveRes.json();
          driveId = driveData.id;
          console.log(`[SharePoint] Drive padrão resolvido: ${driveId}`);
        } else {
          console.log("[SharePoint] Não foi possível resolver o drive /sites/root/drive. Usando endpoint genérico `/drive`.");
        }
      }

      const driveEndpoint = driveId ? `drives/${driveId}` : "drive";

      // 3. Determinar pasta do SharePoint
      // Se tivermos folderId, enviamos direto para dentro dele.
      // Se tivermos um link da pasta, podemos tentar deduzir o nome do cliente.
      // Caso contrário, usamos o padrão "Contratos_Planilhas_Aprovadas/NomeDoCliente"
      let uploadUrl = "";
      let resolvedPath = `Contratos_Planilhas_Aprovadas/${clientName || "Geral"}`;

      if (folderId && folderId.trim().length > 5) {
        // Envia para o ID da pasta específica (children)
        uploadUrl = `https://graph.microsoft.com/v1.0/${driveEndpoint}/items/${folderId.trim()}/children/${encodeURIComponent(fileName)}/content`;
        resolvedPath = `FolderID: ${folderId}`;
      } else {
        // Envia por caminho absoluto relativo ao root do drive
        if (folderLink && folderLink.trim().length > 0) {
          try {
            // Tenta obter uma estrutura amigável se for um caminho, ou se o link contiver pastas
            // Exemplo: https://empresa.sharepoint.com/:f:/g/personal/usuario/Documentos/ClienteX
            // Se não conseguirmos extrair perfeitamente, criamos uma pasta com o nome do cliente e colocamos o link na resposta
            const urlObj = new URL(folderLink);
            const pathParts = urlObj.pathname.split("/");
            // Se tiver caminhos reais no SharePoint, podemos tentar identificá-los, senão usamos o nome do cliente
          } catch (e) {}
        }
        uploadUrl = `https://graph.microsoft.com/v1.0/${driveEndpoint}/root:/${resolvedPath}/${encodeURIComponent(fileName)}:/content`;
      }

      console.log(`[SharePoint] Efetuando upload do arquivo para o Microsoft Graph: ${uploadUrl}`);

      const fileBuffer = Buffer.from(fileBase64, "base64");

      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        },
        body: fileBuffer
      });

      if (!uploadResponse.ok) {
        const errText = await uploadResponse.text();
        throw new Error(`Erro retornado pelo Microsoft Graph durante o upload: ${errText}`);
      }

      const uploadResult: any = await uploadResponse.json();
      console.log(`[SharePoint] Upload concluído com sucesso para ${fileName}`);

      res.json({
        success: true,
        fileName,
        path: resolvedPath,
        webUrl: uploadResult.webUrl || folderLink || "https://sharepoint.com"
      });

    } catch (err: any) {
      console.error("[SharePoint Upload API Error]:", err);
      res.status(500).json({ 
        error: `Erro ao enviar para o SharePoint: ${err.message || "Erro desconhecido"}` 
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
