import React, { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, limit, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { UserProfile, Confession } from '../types';
import ConfessionCard from './ConfessionCard';
import Logo from './Logo';
import { Shield, LogIn, LogOut, Loader2, Filter, Download } from 'lucide-react';

export default function AdminDashboard({ onProfileClick = () => {} }: { onProfileClick?: (username: string) => void }) {
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [confessions, setConfessions] = useState<Confession[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [filter, setFilter] = useState<'flagged' | 'hidden' | 'published'>('flagged');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAdmin(u?.email === 'admin.loginmyauth118@gmail.com' || u?.email === 'dhandamarket@gmail.com' || u?.email === 'team.tgprimetime@gmail.com');
      
      if (u) {
        const profileRef = doc(db, 'users', u.uid);
        onSnapshot(profileRef, (doc) => {
          if (doc.exists()) {
            setUserProfile(doc.data() as UserProfile);
          }
        });
      } else {
        setUserProfile(null);
      }
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
          <button onClick={handleLogout} className="p-2 text-white/40 hover:text-white transition-colors ml-2" title="Logout">
            <LogOut className="w-5 h-5" />
          </button>
          <a 
            href="/logo.svg" 
            download="cloak-confess-logo.svg"
            className="p-2 text-white/40 hover:text-white transition-colors"
            title="Download Logo (SVG)"
          >
            <Download className="w-5 h-5" />
          </a>
          <button
            onClick={() => {
              const svg = document.querySelector('svg');
              if (!svg) return;
              const svgData = new XMLSerializer().serializeToString(svg);
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              const img = new Image();
              const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
              const url = URL.createObjectURL(svgBlob);
              img.onload = () => {
                canvas.width = 1000;
                canvas.height = 1000;
                ctx?.drawImage(img, 0, 0, 1000, 1000);
                URL.revokeObjectURL(url);
                const pngUrl = canvas.toDataURL('image/png');
                const downloadLink = document.createElement('a');
                downloadLink.href = pngUrl;
                downloadLink.download = 'cloak-confess-logo.png';
                document.body.appendChild(downloadLink);
                downloadLink.click();
                document.body.removeChild(downloadLink);
              };
              img.src = url;
            }}
            className="px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-[10px] text-white/40 hover:text-white hover:bg-white/10 transition-all"
          >
            PNG
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-10 h-10 animate-spin text-accent" />
        </div>
      ) : confessions.length === 0 ? (
        <div className="text-center py-20 glass rounded-2xl border border-dashed border-white/10">
          <div className="w-12 h-12 mx-auto mb-4 opacity-20">
            <Logo />
          </div>
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
              onProfileClick={onProfileClick}
              currentUserProfile={userProfile}
            />
          ))}
        </div>
      )}
    </div>
  );
}
