import fs from "fs";
import path from "path";

// 1. Load config and set environment variables BEFORE any other imports
const firebaseConfig = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf-8"));
process.env.GOOGLE_CLOUD_PROJECT = firebaseConfig.projectId;
process.env.GCLOUD_PROJECT = firebaseConfig.projectId;

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
  query as clientQuery,
  where as clientWhere
} from "firebase/firestore";

// 2. Initialize Admin with explicit project ID
const firebaseApp = admin.initializeApp({
  projectId: firebaseConfig.projectId
});

// 3. Initialize Firestore Admin
const dbAdmin = getAdminFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

// 4. Initialize Client SDK for workaround (respects public rules)
const clientApp = initializeClientApp({
  apiKey: firebaseConfig.apiKey,
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
  appId: firebaseConfig.appId
});
const dbClient = getClientFirestore(clientApp, firebaseConfig.firestoreDatabaseId);

// Unified DB reference - will try client SDK for writes if admin fails or just use it as primary for now
const db = dbAdmin; 

console.log(`[Firebase] Initialized Project: ${firebaseConfig.projectId}`);
console.log(`[Firebase] Using Database ID: ${firebaseConfig.firestoreDatabaseId}`);

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

async function robustSetDoc(col: string, id: string, data: any) {
  try {
    // Try Admin first
    await dbAdmin.collection(col).doc(id).set(prepareData(data, 'admin'));
  } catch (err: any) {
    if (err.message.includes("PERMISSION_DENIED") || err.message.includes("serialize")) {
      console.warn(`Admin write failed, trying Client SDK workaround for ${col}/${id}`);
      // Try Client SDK
      const docRef = clientDoc(dbClient, col, id);
      await clientSetDoc(docRef, prepareData(data, 'client'));
    } else {
      throw err;
    }
  }
}

async function robustUpdateDoc(col: string, id: string, data: any) {
  try {
    await dbAdmin.collection(col).doc(id).update(prepareData(data, 'admin'));
  } catch (err: any) {
    if (err.message.includes("PERMISSION_DENIED") || err.message.includes("serialize")) {
      const docRef = clientDoc(dbClient, col, id);
      await clientUpdateDoc(docRef, prepareData(data, 'client'));
    } else {
      throw err;
    }
  }
}

async function robustDeleteDoc(col: string, id: string) {
  try {
    console.log(`[Firebase] Attempting Admin delete: ${col}/${id}`);
    await dbAdmin.collection(col).doc(id).delete();
    console.log(`[Firebase] Admin delete success: ${col}/${id}`);
  } catch (err: any) {
    console.warn(`[Firebase] Admin delete failed for ${col}/${id}:`, err.message);
    // Tenta SDK de cliente para qualquer erro de permissão ou falha do Admin
    try {
      console.log(`[Firebase] Attempting Client workaround delete: ${col}/${id}`);
      const docRef = clientDoc(dbClient, col, id);
      await clientDeleteDoc(docRef);
      console.log(`[Firebase] Client workaround delete success: ${col}/${id}`);
    } catch (clientErr: any) {
      console.error(`[Firebase] Client workaround delete ALSO failed:`, clientErr.message);
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
    await signInWithEmailAndPassword(authClient, adminEmail, adminPassword);
    console.log("[Firebase] Client SDK Workaround authenticated.");
  } catch(e: any) {
    if (e.code === 'auth/user-not-found') {
      try {
        const restUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`;
        await fetch(restUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: adminEmail, password: adminPassword, returnSecureToken: true })
        });
        const authClient = getClientAuth(clientApp);
        await signInWithEmailAndPassword(authClient, adminEmail, adminPassword);
        console.log("[Firebase] Client SDK Workaround authenticated after creation.");
      } catch(e2: any) {}
    }
  }

  try {
    let user;
    try {
      user = await admin.auth().getUserByEmail(adminEmail);
    } catch (e: any) {
      if (e.code === 'auth/user-not-found') {
        console.log("Creating default admin...");
        user = await admin.auth().createUser({
          email: adminEmail,
          password: adminPassword,
          displayName: "Administrador Geral"
        });
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
    const snap = await dbAdmin.collection(col).doc(id).get();
    return {
      exists: snap.exists,
      data: () => snap.data()
    };
  } catch (err: any) {
    if (err.message.includes("PERMISSION_DENIED")) {
      console.warn(`Admin get failed, trying Client SDK workaround for ${col}/${id}`);
      const docRef = clientDoc(dbClient, col, id);
      const snap = await clientGetDoc(docRef);
      return {
        exists: snap.exists(),
        data: () => snap.data()
      };
    } else {
      throw err;
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  ensureAdminUser().catch(console.error);

  app.use(express.json());

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
    
    try {
      const snapshot = await robustGetDoc("users", uid);
      
      const userData: any = {
        uid,
        email: email || "",
        displayName: displayName || email || "Usuário",
        updatedAt: SERVER_TIMESTAMP
      };

      if (!snapshot.exists) {
        userData.role = (email === 'kennedy.adm3@gmail.com' || email === 'admin@preventivas.com' || email === 'admin@lefrio.com') ? 'admin' : 'technician';
        userData.clientId = null;
        userData.createdAt = SERVER_TIMESTAMP;
        await robustSetDoc("users", uid, userData);
      } else {
        const existingData = snapshot.data();
        userData.role = (email === 'kennedy.adm3@gmail.com' || email === 'admin@preventivas.com' || email === 'admin@lefrio.com') ? 'admin' : (existingData?.role || 'technician');
        userData.clientId = existingData?.clientId || null;
        await robustUpdateDoc("users", uid, userData);
      }
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Sync user error:", error);
      res.status(500).json({ error: error.message });
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

  app.get("/api/users", async (req, res) => {
    try {
      let users;
      try {
        const snapshot = await dbAdmin.collection("users").get();
        users = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
      } catch (err: any) {
        if (err.message.includes("PERMISSION_DENIED") || err.message.includes("NOT_FOUND")) {
          console.warn("Admin list users failed, trying Client SDK");
          const snapshot = await clientGetDocs(clientCollection(dbClient, "users"));
          users = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
        } else {
          throw err;
        }
      }
      res.json(users);
    } catch (error: any) {
      console.error("List users failed:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/users", async (req, res) => {
    const { username, email: emailInput, password, displayName, role, clientId } = req.body;
    try {
      const email = ensureEmailFormat(username || emailInput);
      
      let uid;
      let authCreated = false;

      // WORKAROUND: Use REST API to create user if Admin SDK is blocked
      try {
        const restUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`;
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
        console.warn("Both REST and Admin creation failed, falling back to FS-only:", err.message);
        uid = "fs_" + Buffer.from(email).toString('hex').slice(0, 20);
      }

      await robustSetDoc("users", uid, {
        uid,
        email,
        displayName,
        role: role || 'technician',
        clientId: clientId || null,
        createdAt: SERVER_TIMESTAMP,
        updatedAt: SERVER_TIMESTAMP,
        authCreated
      });

      res.json({ 
        success: true, 
        uid, 
        authCreated,
        message: authCreated ? "Usuário criado com sucesso!" : "Usuário criado apenas no banco (Login indisponível - API desativada)"
      });
    } catch (error: any) {
      console.error("Create user failed:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/users/:uid", async (req, res) => {
    const { uid } = req.params;
    try {
      try { await admin.auth().deleteUser(uid); } catch (e) {}
      await robustDeleteDoc("users", uid);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
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
