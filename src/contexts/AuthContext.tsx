import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import { auth, firebaseOnAuthStateChanged, firebaseSignOutFn } from "@/integrations/firebase/client";

interface AuthContextType {
  user: FirebaseUser | null;
  session: null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [session] = useState<null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = firebaseOnAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signOut = async () => {
    await firebaseSignOutFn(auth);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
