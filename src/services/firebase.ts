import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDocFromServer,
  collection,
  setDoc,
  getDocs,
  query,
  orderBy,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

export { onAuthStateChanged };
export type { FirebaseUser };

// Initialize Firebase App with provisioned credentials
export const app = initializeApp(firebaseConfig);

// CRITICAL: Must pass the firestoreDatabaseId according to Firebase skill
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Google Auth Provider setup
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

// Operation Types for error handling
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Connection check on boot
export async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore offline check:', error.message);
    }
  }
}

// Sign In with Google via Popup
export async function signInWithGoogle(): Promise<FirebaseUser> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    // Persist or update user profile document in Firestore
    const userRef = doc(db, 'users', user.uid);
    await setDoc(userRef, {
      id: user.uid,
      email: user.email || '',
      displayName: user.displayName || 'Trader',
      photoURL: user.photoURL || '',
      lastLogin: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    return user;
  } catch (error) {
    console.error('Google Sign-in Error:', error);
    throw error;
  }
}

// Sign Out
export async function logOutFirebase(): Promise<void> {
  await signOut(auth);
}

// Strategy persistence helpers in Firestore
export interface FirestoreStrategy {
  id: string;
  userId: string;
  name: string;
  code: string;
  category: string;
  createdAt: string;
  updatedAt: string;
}

export async function saveUserStrategyToFirestore(
  userId: string,
  strategy: { id?: string; name: string; code: string; category: string }
): Promise<string> {
  const path = `users/${userId}/strategies`;
  const stratId = strategy.id || `strat_${Date.now()}`;
  try {
    const stratRef = doc(db, 'users', userId, 'strategies', stratId);
    await setDoc(stratRef, {
      id: stratId,
      userId,
      name: strategy.name,
      code: strategy.code,
      category: strategy.category,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    return stratId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `${path}/${stratId}`);
    return stratId;
  }
}

export async function getUserStrategiesFromFirestore(userId: string): Promise<FirestoreStrategy[]> {
  const path = `users/${userId}/strategies`;
  try {
    const q = collection(db, 'users', userId, 'strategies');
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => d.data() as FirestoreStrategy);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}

// Backtest record persistence in Firestore
export async function saveBacktestReportToFirestore(
  userId: string,
  data: {
    strategyName: string;
    symbol: string;
    timeframe: string;
    totalReturnPct: number;
    winRatePct: number;
    sharpeRatio: number;
    maxDrawdownPct: number;
    profitFactor: number;
    totalTrades: number;
  }
): Promise<string> {
  const path = `users/${userId}/backtests`;
  const reportId = `report_${Date.now()}`;
  try {
    const reportRef = doc(db, 'users', userId, 'backtests', reportId);
    await setDoc(reportRef, {
      id: reportId,
      userId,
      ...data,
      createdAt: new Date().toISOString(),
    });
    return reportId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `${path}/${reportId}`);
    return reportId;
  }
}

export async function getUserBacktestsFromFirestore(userId: string) {
  const path = `users/${userId}/backtests`;
  try {
    const q = collection(db, 'users', userId, 'backtests');
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => d.data());
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}

// Order persistence helpers in Firestore
export async function saveTradeOrderToFirestore(
  userId: string,
  order: {
    symbol: string;
    side: 'BUY' | 'SELL';
    amount: number;
    price: number;
    status: string;
  }
): Promise<string> {
  const path = `users/${userId}/orders`;
  const orderId = `ord_${Date.now()}`;
  try {
    const orderRef = doc(db, 'users', userId, 'orders', orderId);
    await setDoc(orderRef, {
      id: orderId,
      userId,
      symbol: order.symbol.slice(0, 32),
      side: order.side,
      amount: order.amount,
      price: order.price,
      status: order.status.slice(0, 32),
      createdAt: new Date().toISOString(),
    });
    return orderId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `${path}/${orderId}`);
    return orderId;
  }
}

export async function getUserOrdersFromFirestore(userId: string) {
  const path = `users/${userId}/orders`;
  try {
    const q = collection(db, 'users', userId, 'orders');
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => d.data());
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
    return [];
  }
}
