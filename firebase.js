/* ================================================================
   AntiProc — firebase.js  |  Cloud Sync via Firebase v12
   ================================================================
   Firebase SDK: ^12.10.0  |  firebase-tools: ^15.10.1

   SETUP STEPS (one-time):
   1. Go to https://console.firebase.google.com
   2. Click "Add project" → name it e.g. "antiproc-apex"
   3. In the project, click "Build" → "Authentication"
      → "Get started" → "Google" → Enable → Save
   4. Click "Build" → "Firestore Database"
      → "Create database" → "Start in production mode" → pick any region
      → In "Rules" tab, replace the rule with:
          rules_version = '2';
          service cloud.firestore {
            match /databases/{database}/documents {
              match /users/{uid}/{document=**} {
                allow read, write: if request.auth != null && request.auth.uid == uid;
              }
            }
          }
   5. Click the gear ⚙ icon → "Project settings" → scroll to "Your apps"
      → Click the Web </> icon → register app → copy the firebaseConfig object
   6. Replace the PLACEHOLDER values below with your actual config
   ================================================================ */

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  browserLocalPersistence,
  setPersistence
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  enableIndexedDbPersistence
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCg65qfCUEzkUzd7KnJbggpSnmakZtqKc4",
  authDomain: "antiproc-apex.firebaseapp.com",
  projectId: "antiproc-apex",
  storageBucket: "antiproc-apex.firebasestorage.app",
  messagingSenderId: "275360909968",
  appId: "1:275360909968:web:2273d52a34cffc02166615",
  measurementId: "G-GSLWZWJRRB"
};

let auth, db;

const CONFIGURED = !firebaseConfig.apiKey.startsWith('REPLACE');

if (CONFIGURED) {
  try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);

    /* Enable IndexedDB offline persistence so Firestore works even with
       brief connection drops. Errors here are non-fatal (e.g. multiple tabs). */
    enableIndexedDbPersistence(db).catch(e => {
      if (e.code === 'failed-precondition') {
        console.info('[AntiProc] Firestore offline persistence disabled (multiple tabs open).');
      } else if (e.code === 'unimplemented') {
        console.info('[AntiProc] Firestore offline persistence not supported in this browser.');
      }
    });

    /* Keep auth session alive across browser restarts */
    setPersistence(auth, browserLocalPersistence).catch(e => {
      console.warn('[AntiProc] Auth persistence error:', e.message);
    });

  } catch (e) {
    console.warn('[AntiProc] Firebase init failed:', e.message);
  }
} else {
  console.info('[AntiProc] Firebase not configured — running offline only. Fill in firebase.js to enable sync.');
}

export function isFirebaseReady() { return !!(auth && db); }

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

export async function fbSignIn() {
  if (!auth) throw new Error('Firebase not configured');
  /* signInWithPopup works reliably across all platforms when called from a
     direct user gesture. signInWithRedirect is broken on mobile due to
     cross-origin cookie restrictions (iOS Safari ITP, Chrome). */
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function fbSignOut() {
  if (!auth) return;
  await signOut(auth);
}

export function onAuthChange(cb) {
  if (!auth) { cb(null); return () => { }; }
  return onAuthStateChanged(auth, cb);
}

/* ── Firestore CRUD helpers ── */
const stateDocRef = (uid) => doc(db, 'users', uid, 'apex', 'state');

export async function pushState(uid, stateJson, savedAt) {
  if (!db) return;
  await setDoc(stateDocRef(uid), { data: stateJson, savedAt });
}

export async function pullState(uid) {
  if (!db) return null;
  const snap = await getDoc(stateDocRef(uid));
  return snap.exists() ? snap.data() : null;   // { data, savedAt }
}

export async function deleteState(uid) {
  if (!db) return;
  await deleteDoc(stateDocRef(uid));
}
