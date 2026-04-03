import { db } from "@/integrations/firebase/client";
import { collection, query, where, onSnapshot, getDocs } from "firebase/firestore";

const STORAGE_KEY = "hobt0_cards_cache";
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

interface CacheEntry {
  data: any[];
  timestamp: number;
  userId: string;
}

export const cardsCache = {
  get(userId: string): any[] | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const entry: CacheEntry = JSON.parse(raw);
      if (entry.userId !== userId) return null;
      if (Date.now() - entry.timestamp > CACHE_TTL) return null;
      return entry.data;
    } catch {
      return null;
    }
  },

  set(userId: string, data: any[]) {
    try {
      const entry: CacheEntry = { data, timestamp: Date.now(), userId };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
    } catch {
      // Ignore storage errors
    }
  },

  clear() {
    localStorage.removeItem(STORAGE_KEY);
  },
};

// Fast initial load from cache, then sync with Firestore
export function subscribeToCards(
  userId: string,
  onUpdate: (cards: any[]) => void
) {
  // 1. Instant load from cache
  const cached = cardsCache.get(userId);
  if (cached) {
    onUpdate(cached);
  }

  // 2. Subscribe to real-time updates (faster than getDocs)
  const q = query(collection(db, "cards"), where("user_id", "==", userId));
  
  const unsubscribe = onSnapshot(q, (snap) => {
    const cards = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    cardsCache.set(userId, cards);
    onUpdate(cards);
  }, (error) => {
    console.error("[Cards] Subscription error:", error);
    // Fallback to one-time fetch on error
    getDocs(q).then((snap) => {
      const cards = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      onUpdate(cards);
    });
  });

  return unsubscribe;
}

// One-time fetch for manual refresh
export async function fetchCardsOnce(userId: string): Promise<any[]> {
  const cached = cardsCache.get(userId);
  if (cached) return cached;
  
  const q = query(collection(db, "cards"), where("user_id", "==", userId));
  const snap = await getDocs(q);
  const cards = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  cardsCache.set(userId, cards);
  return cards;
}
