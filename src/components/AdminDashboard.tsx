import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, limit, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { Confession } from '../types';
import ConfessionCard from './ConfessionCard';
import { Shield, LogIn, LogOut, Loader2, Search, Filter } from 'lucide-react';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function AdminDashboard() {
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [confessions, setConfessions] = useState<Confession[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [filter, setFilter] = useState<'flagged' | 'hidden' | 'published'>('flagged');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAdmin(u?.email === 'admin.loginmyauth118@gmail.com');
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAdmin) return;

    setLoading(true);
    const q = query(
      collection(db, 'confessions'),
      where('status', '==', filter),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Confession));
      // Sort client-side
      data.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(0);
        const dateB = b.createdAt?.toDate?.() || new Date(0);
        return dateB.getTime() - dateA.getTime();
      });
      setConfessions(data);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'confessions');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isAdmin, filter]);

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      if (err.code !== 'auth/cancelled-popup-request' && err.code !== 'auth/popup-closed-by-user') {
        console.error(err);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => signOut(auth);

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Shield className="w-16 h-16 text-accent mb-6 opacity-20" />
        <h2 className="text-3xl font-serif italic mb-4">Admin Access Only</h2>
        <p className="text-white/40 mb-8 max-w-md">
          Please sign in with your authorized Google account to access the moderation dashboard.
        </p>
        <button
          onClick={handleLogin}
          disabled={isLoggingIn}
          className="flex items-center gap-2 bg-white text-black px-8 py-3 rounded-full font-medium hover:bg-white/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
          {isLoggingIn ? 'Signing In...' : 'Sign in with Google'}
        </button>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Shield className="w-16 h-16 text-red-500 mb-6 opacity-40" />
        <h2 className="text-3xl font-serif italic mb-4">Access Denied</h2>
        <p className="text-white/40 mb-8">
          Your account ({user.email}) is not authorized for admin access.
        </p>
        <button onClick={handleLogout} className="text-accent hover:underline flex items-center gap-2">
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass p-6 rounded-2xl">
        <div>
          <h2 className="text-2xl font-serif italic text-accent flex items-center gap-2">
            <Shield className="w-6 h-6" />
            Moderation Dashboard
          </h2>
          <p className="text-xs text-white/40 mt-1">Logged in as {user.email}</p>
        </div>

        <div className="flex items-center gap-2">
          {(['flagged', 'hidden', 'published'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-all ${
                filter === f 
                  ? 'bg-accent border-accent text-white' 
                  : 'bg-white/5 border-white/10 text-white/40 hover:border-white/30'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          <button onClick={handleLogout} className="p-2 text-white/40 hover:text-white transition-colors ml-2">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-10 h-10 animate-spin text-accent" />
        </div>
      ) : confessions.length === 0 ? (
        <div className="text-center py-20 glass rounded-2xl border border-dashed border-white/10">
          <Search className="w-12 h-12 text-white/10 mx-auto mb-4" />
          <p className="text-white/40">No confessions found in this queue.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {confessions.map((c) => (
            <ConfessionCard 
              key={c.id} 
              confession={c} 
              isAdmin={true} 
              onAction={() => {}} 
            />
          ))}
        </div>
      )}
    </div>
  );
}
