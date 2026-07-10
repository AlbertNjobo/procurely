import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signInWithEmailAndPassword, GoogleAuthProvider, signOut, browserPopupRedirectResolver } from 'firebase/auth';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserRole, UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  login: () => Promise<void>;
  demoLogin: () => Promise<void>;
  logout: () => Promise<void>;
  updateRole: (role: UserRole) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const userRef = doc(db, 'users', u.uid);
        const unsubscribeProfile = onSnapshot(userRef, async (docSnap) => {
          if (docSnap.exists()) {
            setProfile(docSnap.data() as UserProfile);
          } else {
            const newProfile: UserProfile = {
              uid: u.uid,
              email: u.email,
              displayName: u.displayName,
              role: 'Admin'
            };
            await setDoc(userRef, newProfile);
            setProfile(newProfile);
          }
          setLoading(false);
        });
        return () => unsubscribeProfile();
      } else {
        setProfile(null);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider, browserPopupRedirectResolver);
    } catch (error: any) {
      if (
        error.code === 'auth/cancelled-popup-request' ||
        error.code === 'auth/popup-closed-by-user'
      ) {
        console.log('Login popup was closed or cancelled by the user.');
      } else {
        console.error('Login error:', error);
      }
    }
  };

  const demoLogin = async () => {
    try {
      await signInWithEmailAndPassword(auth, 'demo@procurely.app', 'DemoProcurely2026!');
    } catch (error: any) {
      console.error('Demo login error:', error);
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const updateRole = async (role: UserRole) => {
    if (!user) return;
    await setDoc(doc(db, 'users', user.uid), { role }, { merge: true });
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, demoLogin, logout, updateRole }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
