import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut as firebaseSignOut,
} from "firebase/auth";
import {
  getFirestore,
  serverTimestamp,
  enableIndexedDbPersistence,
  CACHE_SIZE_UNLIMITED,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD8eVAe28kpqVa6zMgybZujobzC9rg6NmQ",
  authDomain: "hobt0-31671.firebaseapp.com",
  projectId: "hobt0-31671",
  storageBucket: "hobt0-31671.firebasestorage.app",
  messagingSenderId: "856772303133",
  appId: "1:856772303133:web:4ae82b01e58ef233a129f4",
  measurementId: "G-N39VQHCPN5",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// Enable offline persistence for faster local reads
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === "failed-precondition") {
    console.warn("Firestore persistence failed: multiple tabs open");
  } else if (err.code === "unimplemented") {
    console.warn("Browser doesn't support IndexedDB");
  }
});

export const googleProvider = new GoogleAuthProvider();
export const firebaseOnAuthStateChanged = onAuthStateChanged;
export const firebaseSignOutFn = firebaseSignOut;
export const firebaseServerTimestamp = serverTimestamp;

