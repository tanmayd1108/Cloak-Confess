import React, { useState, useEffect, useRef } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { 
  doc, 
  getDoc, 
  getDocFromServer,
  updateDoc, 
  collection, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  deleteDoc,
  setDoc,
  getDocs,
  serverTimestamp
} from 'firebase/firestore';
import { UserProfile, Confession, SavedConfession } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, 
  Settings, 
  Lock, 
  Unlock, 
  Edit3, 
  Trash2, 
  Eye, 
  EyeOff, 
  Bookmark, 
  Grid, 
  History,
  Check,
  X,
  Loader2,
  Camera,
  LogOut,
  Shield,
  LogIn,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';
import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import ConfessionCard from './ConfessionCard';
import { generateAvatarUrl } from '../utils/profile';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const AVATAR_CATEGORIES = [
  {
    id: 'men',
    label: '1',
    seeds: ['Felix', 'Max', 'Christopher', 'Oliver', 'George', 'Harry', 'Jack', 'Leo', 'Charlie', 'Noah']
  },
  {
    id: 'women',
    label: '2',
    seeds: ['Aneka', 'Tiana', 'Sasha', 'Jocelyn', 'Kimberly', 'Lilly', 'Mia', 'Sophia', 'Isabella', 'Ava']
  },
  {
    id: 'boys',
    label: '3',
    seeds: ['Jack', 'Leo', 'Charlie', 'Harry', 'Noah', 'Oliver', 'George', 'Max', 'Felix', 'Christopher']
  },
  {
    id: 'girl',
    label: '4',
    seeds: ['Lilly', 'Mia', 'Sophia', 'Isabella', 'Ava', 'Aneka', 'Tiana', 'Sasha', 'Jocelyn', 'Kimberly']
  }
];

interface UserProfilePageProps {
  username?: string; // If provided, view this user's profile
  onClose: () => void;
  onViewChange?: (view: any) => void;
  currentUserProfile?: UserProfile | null;
}

export default function UserProfilePage({ username: targetUsername, onClose, onViewChange, currentUserProfile }: UserProfilePageProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'posts' | 'saved' | 'settings'>('posts');
  const [userConfessions, setUserConfessions] = useState<Confession[]>([]);
  const [savedConfessions, setSavedConfessions] = useState<Confession[]>([]);
  
  // Settings state
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [newAvatarUrl, setNewAvatarUrl] = useState<string | null>(null);
  const [selectedAvatarCategory, setSelectedAvatarCategory] = useState(AVATAR_CATEGORIES[0].id);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      try {
        if (targetUsername) {
          // Find user by username
          const usernameRef = doc(db, 'usernames', targetUsername.toLowerCase());
          const usernameSnap = await getDoc(usernameRef);
          
          if (usernameSnap.exists()) {
            const uid = usernameSnap.data().uid;
            const profileRef = doc(db, 'users', uid);
            const profileSnap = await getDoc(profileRef);
            
            if (profileSnap.exists()) {
              const data = profileSnap.data() as UserProfile;
              setProfile(data);
              setIsOwnProfile(uid === auth.currentUser?.uid);
              setEditUsername(data.username);
              setEditBio(data.bio || '');
              setIsPublic(data.isPublic);
            }
          }
        } else if (auth.currentUser) {
          // Own profile
          const profileRef = doc(db, 'users', auth.currentUser.uid);
          const profileSnap = await getDoc(profileRef);
          if (profileSnap.exists()) {
            const data = profileSnap.data() as UserProfile;
            setProfile(data);
            setIsOwnProfile(true);
            setEditUsername(data.username);
            setEditBio(data.bio || '');
            setIsPublic(data.isPublic);
          }
        }
      } catch (err) {
        console.error("Error fetching profile:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [targetUsername, auth.currentUser]);

  // Fetch user's confessions
  useEffect(() => {
    if (!profile) return;

    let q = query(
      collection(db, 'confessions'),
      where('authorUid', '==', profile.uid)
    );

    // If not own profile, only show published and public confessions
    if (!isOwnProfile) {
      q = query(q, where('status', '==', 'published'), where('isPrivate', '==', false));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Confession));
      // Sort client-side to avoid index requirement
      data.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(0);
        const dateB = b.createdAt?.toDate?.() || new Date(0);
        return dateB.getTime() - dateA.getTime();
      });
      setUserConfessions(data);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'confessions');
    });

    return () => unsubscribe();
  }, [profile?.uid, isOwnProfile]);

  // Fetch saved confessions
  useEffect(() => {
    if (!isOwnProfile || !auth.currentUser) return;

    const q = query(
      collection(db, 'saved_confessions'),
      where('uid', '==', auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const savedDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort client-side
      savedDocs.sort((a: any, b: any) => {
        const dateA = a.savedAt?.toDate?.() || new Date(0);
        const dateB = b.savedAt?.toDate?.() || new Date(0);
        return dateB.getTime() - dateA.getTime();
      });
      
      const savedIds = savedDocs.map((doc: any) => doc.confessionId);
      
      if (savedIds.length === 0) {
        setSavedConfessions([]);
        return;
      }

      try {
        // Fetch actual confessions for saved IDs in parallel
        const confessionPromises = savedIds.map(async (id) => {
          try {
            const docRef = doc(db, 'confessions', id);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
              return { id: docSnap.id, ...docSnap.data() } as Confession;
            }
          } catch (err) {
            // If we don't have permission to read this specific confession anymore
            // (e.g. it was hidden or made private and we're no longer invited),
            // just skip it instead of failing the whole list.
            console.warn(`Could not fetch saved confession ${id}:`, err);
          }
          return null;
        });

        const results = await Promise.all(confessionPromises);
        setSavedConfessions(results.filter((c): c is Confession => c !== null));
      } catch (err) {
        console.error("Error processing saved confessions details:", err);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'saved_confessions');
    });

    return () => unsubscribe();
  }, [isOwnProfile]);

  const checkUsername = async (val: string) => {
    const username = val.toLowerCase().trim();
    if (username === profile?.username.toLowerCase()) {
      setUsernameStatus('idle');
      return;
    }

    if (!/^[a-z0-9_]{3,50}$/.test(username)) {
      setUsernameStatus('invalid');
      return;
    }

    setUsernameStatus('checking');
    try {
      const docRef = doc(db, 'usernames', username);
      const docSnap = await getDoc(docRef);
      setUsernameStatus(docSnap.exists() ? 'taken' : 'available');
    } catch (err) {
      console.error(err);
      setUsernameStatus('idle');
    }
  };

  const handleSaveSettings = async () => {
    if (!profile || !auth.currentUser) return;
    setSaving(true);
    setSaveSuccess(false);

    try {
      const updates: any = {
        bio: editBio,
        isPublic: isPublic,
        updatedAt: serverTimestamp(),
        lastActive: serverTimestamp()
      };

      if (newAvatarUrl) {
        updates.avatarUrl = newAvatarUrl;
      }

      const newUsername = editUsername.toLowerCase().trim();
      const oldUsername = profile.username.toLowerCase().trim();

      if (newUsername !== oldUsername && usernameStatus === 'available') {
        console.log(`Updating username from ${oldUsername} to ${newUsername}`);
        // Update username mapping
        // We use toLowerCase() to ensure we target the correct document ID
        try {
          await deleteDoc(doc(db, 'usernames', oldUsername.toLowerCase()));
          console.log("Deleted old username mapping");
          await setDoc(doc(db, 'usernames', newUsername.toLowerCase()), { uid: auth.currentUser.uid });
          console.log("Created new username mapping");
        } catch (usernameErr) {
          console.error("Error updating username mapping:", usernameErr);
          handleFirestoreError(usernameErr, OperationType.WRITE, `usernames/${newUsername}`);
          throw usernameErr;
        }
        
        updates.username = newUsername;
        updates.username_lower = newUsername;
        // Only regenerate avatar if user hasn't uploaded a custom one
        if (!newAvatarUrl) {
          updates.avatarUrl = generateAvatarUrl(newUsername);
        }
      }

      console.log("Updating profile with:", updates);
      console.log("User ID:", auth.currentUser.uid);
      
      // Check if document exists before update
      const docRef = doc(db, 'users', auth.currentUser.uid);
      try {
        const docSnap = await getDocFromServer(docRef);
        console.log("Document exists before update:", docSnap.exists());
      } catch (checkErr) {
        console.error("Error checking document existence:", checkErr);
        handleFirestoreError(checkErr, OperationType.GET, `users/${auth.currentUser.uid}`);
      }
      
      await updateDoc(docRef, updates);
      
      const updatedProfile = { ...profile, ...updates };
      setProfile(updatedProfile);
      setSaveSuccess(true);
      
      // Reset username status to idle since it's now the current username
      setUsernameStatus('idle');
      
      // Wait a bit to show success before switching back
      setTimeout(() => {
        setActiveTab('posts');
        setSaveSuccess(false);
      }, 1500);
    } catch (err) {
      console.error("Error saving settings:", err);
      setError("Failed to save settings. Please try again.");
      setTimeout(() => setError(null), 3000);
      handleFirestoreError(err, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
    } finally {
      setSaving(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Limit to 500KB to stay safe with Firestore document limits
    if (file.size > 512 * 1024) {
      setError("Image size should be less than 512KB");
      setTimeout(() => setError(null), 3000);
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setNewAvatarUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDeleteConfession = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'confessions', id));
      setConfirmDeleteId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `confessions/${id}`);
    }
  };

  const toggleConfessionVisibility = async (id: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'hidden' ? 'published' : 'hidden';
      await updateDoc(doc(db, 'confessions', id), { status: newStatus });
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      onClose();
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const handleGoogleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      // Refresh profile after login
      window.location.reload();
    } catch (err: any) {
      if (err.code !== 'auth/cancelled-popup-request' && err.code !== 'auth/popup-closed-by-user') {
        console.error("Google login failed:", err);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center space-y-6 text-center p-6">
        <div className="glass p-8 rounded-3xl max-w-md w-full space-y-6">
          <User className="w-16 h-16 text-white/20 mx-auto" />
          <div className="space-y-2">
            <h2 className="text-3xl font-serif italic text-white/80">Profile not found</h2>
            <p className="text-white/40 text-sm">
              Sign in to create your anonymous profile and start sharing your secrets.
            </p>
          </div>
          
          <div className="flex flex-col gap-3">
            <button
              onClick={handleGoogleLogin}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-white text-black font-medium hover:bg-white/90 transition-all"
            >
              <LogIn className="w-5 h-5" />
              Sign In with Google
            </button>
            <button 
              onClick={onClose} 
              className="text-white/40 hover:text-white text-sm transition-colors"
            >
              Go back home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black/95 text-white pb-20">
      {/* Header */}
      <div className="relative h-32 md:h-48 bg-gradient-to-b from-accent/20 to-transparent">
        <button 
          onClick={onClose}
          className="absolute top-4 md:top-6 left-4 md:left-6 p-2 glass rounded-full hover:bg-white/10 transition-colors z-10"
        >
          <X className="w-5 h-5 md:w-6 md:h-6" />
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-4 md:px-6 -mt-16 md:-mt-24 relative">
        {/* Profile Info */}
        <div className="flex flex-col md:flex-row items-center md:items-end gap-4 md:gap-6 mb-8 md:mb-12 text-center md:text-left">
          <div className="relative group">
            <img 
              src={profile.avatarUrl} 
              alt={profile.username}
              className="w-24 h-24 md:w-32 md:h-32 rounded-3xl border-4 border-black shadow-2xl bg-black"
            />
            {isOwnProfile && (
              <button 
                onClick={() => setActiveTab('settings')}
                className="absolute bottom-2 right-2 p-2 bg-accent rounded-xl shadow-lg md:opacity-0 md:group-hover:opacity-100 transition-opacity"
              >
                <Camera className="w-4 h-4" />
              </button>
            )}
          </div>
          
          <div className="flex-1 space-y-2 w-full">
            <div className="flex items-center justify-center md:justify-start gap-3">
              <h1 className="text-2xl md:text-3xl font-serif italic">@{profile.username}</h1>
              {profile.isPublic ? (
                <Unlock className="w-4 h-4 text-green-500/60" />
              ) : (
                <Lock className="w-4 h-4 text-red-500/60" />
              )}
            </div>
            {profile.bio && <p className="text-white/60 max-w-md mx-auto md:mx-0 text-sm md:text-base">{profile.bio}</p>}
            
            <div className="flex items-center justify-center md:justify-start gap-6 pt-2">
              <div className="text-center">
                <div className="text-lg md:text-xl font-mono font-bold">
                  {isOwnProfile ? userConfessions.length : (profile.stats?.totalPosts || 0)}
                </div>
                <div className="text-[10px] uppercase tracking-widest text-white/20">Posts</div>
              </div>
              <div className="text-center">
                <div className="text-lg md:text-xl font-mono font-bold">
                  {isOwnProfile 
                    ? userConfessions.reduce((acc, c) => acc + Object.values(c.reactions || {}).reduce((a, b) => a + b, 0), 0)
                    : (profile.stats?.totalLikes || 0)}
                </div>
                <div className="text-[10px] uppercase tracking-widest text-white/20">Likes</div>
              </div>
              <div className="text-center">
                <div className="text-lg md:text-xl font-mono font-bold">
                  {isOwnProfile 
                    ? userConfessions.reduce((acc, c) => acc + (c.viewsCount || 0), 0)
                    : (profile.stats?.totalViews || 0)}
                </div>
                <div className="text-[10px] uppercase tracking-widest text-white/20">Views</div>
              </div>
            </div>

            {isOwnProfile && (
              <div className="flex flex-wrap justify-center md:justify-start gap-2 pt-4">
                {profile?.role === 'admin' && onViewChange && (
                  <button
                    onClick={() => onViewChange('admin')}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs md:text-sm font-medium bg-accent/20 text-accent hover:bg-accent/30 transition-all"
                  >
                    <Shield className="w-4 h-4" />
                    Admin Panel
                  </button>
                )}

                {auth.currentUser?.isAnonymous ? (
                  <button
                    onClick={handleGoogleLogin}
                    disabled={isLoggingIn}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs md:text-sm font-medium bg-white text-black hover:bg-white/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoggingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                    {isLoggingIn ? 'Signing In...' : 'Sign In with Google'}
                  </button>
                ) : (
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs md:text-sm font-medium bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                )}
              </div>
            )}
          </div>

          {isOwnProfile && (
            <button 
              onClick={() => setActiveTab('settings')}
              className="p-3 glass rounded-2xl hover:bg-white/10 transition-colors hidden md:block"
            >
              <Settings className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-4 md:gap-8 border-b border-white/5 mb-8 overflow-x-auto no-scrollbar">
          <button 
            onClick={() => setActiveTab('posts')}
            className={cn(
              "pb-4 text-[10px] md:text-sm font-medium tracking-widest uppercase transition-all relative whitespace-nowrap",
              activeTab === 'posts' ? "text-white" : "text-white/20 hover:text-white/40"
            )}
          >
            <div className="flex items-center gap-1 md:gap-2">
              <Grid className="w-3 h-3 md:w-4 md:h-4" />
              Confessions
            </div>
            {activeTab === 'posts' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />}
          </button>
          
          {isOwnProfile && (
            <>
              <button 
                onClick={() => setActiveTab('saved')}
                className={cn(
                  "pb-4 text-[10px] md:text-sm font-medium tracking-widest uppercase transition-all relative whitespace-nowrap",
                  activeTab === 'saved' ? "text-white" : "text-white/20 hover:text-white/40"
                )}
              >
                <div className="flex items-center gap-1 md:gap-2">
                  <Bookmark className="w-3 h-3 md:w-4 md:h-4" />
                  Saved
                </div>
                {activeTab === 'saved' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />}
              </button>
              
              <button 
                onClick={() => setActiveTab('settings')}
                className={cn(
                  "pb-4 text-[10px] md:text-sm font-medium tracking-widest uppercase transition-all relative whitespace-nowrap",
                  activeTab === 'settings' ? "text-white" : "text-white/20 hover:text-white/40"
                )}
              >
                <div className="flex items-center gap-1 md:gap-2">
                  <Settings className="w-3 h-3 md:w-4 md:h-4" />
                  Settings
                </div>
                {activeTab === 'settings' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />}
              </button>

              {profile?.role === 'admin' && onViewChange && (
                <button 
                  onClick={() => onViewChange('admin')}
                  className="pb-4 text-[10px] md:text-sm font-medium tracking-widest uppercase transition-all relative whitespace-nowrap text-red-500/60 hover:text-red-500"
                >
                  <div className="flex items-center gap-1 md:gap-2">
                    <Shield className="w-3 h-3 md:w-4 md:h-4" />
                    Admin
                  </div>
                </button>
              )}
            </>
          )}
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'posts' && (
            <motion.div 
              key="posts"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 md:grid-cols-2 gap-6"
            >
              {userConfessions.length === 0 ? (
                <div className="col-span-full py-20 text-center text-white/20 italic font-serif">
                  No confessions yet...
                </div>
              ) : (
                userConfessions.map(c => (
                  <div key={c.id} className="relative group">
                    <ConfessionCard confession={c} currentUserProfile={currentUserProfile} />
                    {isOwnProfile && (
                      <div className="absolute top-4 right-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {confirmDeleteId === c.id ? (
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={() => handleDeleteConfession(c.id)}
                              className="px-2 py-1 bg-red-500 text-white text-[10px] rounded-lg hover:bg-red-600 transition-colors"
                            >
                              Confirm
                            </button>
                            <button 
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1 glass text-white text-[10px] rounded-lg hover:bg-white/10 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <button 
                              onClick={() => toggleConfessionVisibility(c.id, c.status)}
                              className="p-2 glass rounded-lg hover:bg-white/20 transition-colors"
                              title={c.status === 'hidden' ? "Make Public" : "Make Private"}
                            >
                              {c.status === 'hidden' ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                            </button>
                            <button 
                              onClick={() => setConfirmDeleteId(c.id)}
                              className="p-2 glass rounded-lg hover:bg-red-500/20 text-red-500 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </motion.div>
          )}

          {activeTab === 'saved' && isOwnProfile && (
            <motion.div 
              key="saved"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 md:grid-cols-2 gap-6"
            >
              {savedConfessions.length === 0 ? (
                <div className="col-span-full py-20 text-center text-white/20 italic font-serif">
                  No saved confessions...
                </div>
              ) : (
                savedConfessions.map(c => (
                  <ConfessionCard key={c.id} confession={c} currentUserProfile={currentUserProfile} />
                ))
              )}
            </motion.div>
          )}

          {activeTab === 'settings' && isOwnProfile && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-xl mx-auto space-y-6 md:space-y-8 glass p-4 md:p-8 rounded-3xl border border-white/5"
            >
              <div className="flex flex-col items-center space-y-6 pb-6 border-b border-white/5">
                <div className="relative group">
                  <img 
                    src={newAvatarUrl || profile.avatarUrl} 
                    alt="Avatar Preview"
                    className="w-24 h-24 md:w-32 md:h-32 rounded-3xl border-2 border-white/10 bg-black object-cover shadow-2xl"
                  />
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl"
                  >
                    <Camera className="w-6 h-6" />
                  </button>
                </div>
                
                <div className="w-full space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] uppercase tracking-widest text-white/40 font-mono">Choose an Avatar</label>
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="text-[10px] font-medium text-accent hover:underline flex items-center gap-1"
                    >
                      <Camera className="w-3 h-3" />
                      Upload Custom
                    </button>
                  </div>

                  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                    {AVATAR_CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setSelectedAvatarCategory(cat.id)}
                        className={cn(
                          "px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap border",
                          selectedAvatarCategory === cat.id 
                            ? "bg-white text-black border-white" 
                            : "bg-white/5 text-white/40 border-white/10 hover:border-white/20"
                        )}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-5 gap-2">
                    {AVATAR_CATEGORIES.find(c => c.id === selectedAvatarCategory)?.seeds.map((seed) => {
                      const url = `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;
                      return (
                        <button
                          key={seed}
                          onClick={() => setNewAvatarUrl(url)}
                          className={cn(
                            "aspect-square rounded-xl border-2 transition-all overflow-hidden bg-black/40 hover:scale-105",
                            (newAvatarUrl === url || (!newAvatarUrl && profile.avatarUrl === url))
                              ? "border-accent" 
                              : "border-transparent hover:border-white/20"
                          )}
                        >
                          <img 
                            src={url} 
                            alt={seed} 
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <input 
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  className="hidden"
                />
                <p className="text-[10px] text-white/20">Max upload size: 512KB</p>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] uppercase tracking-widest text-white/40 font-mono">Username</label>
                <div className="relative">
                  <input 
                    type="text"
                    value={editUsername}
                    onChange={(e) => {
                      setEditUsername(e.target.value.toLowerCase());
                      checkUsername(e.target.value);
                    }}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-4 md:py-3 focus:outline-none focus:border-accent transition-colors text-sm md:text-base"
                    placeholder="unique_username"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    {usernameStatus === 'checking' && <Loader2 className="w-4 h-4 animate-spin text-white/40" />}
                    {usernameStatus === 'available' && <Check className="w-4 h-4 text-green-500" />}
                    {usernameStatus === 'taken' && <X className="w-4 h-4 text-red-500" />}
                  </div>
                </div>
                {usernameStatus === 'taken' && <p className="text-xs text-red-500">Username is already taken</p>}
                {usernameStatus === 'invalid' && <p className="text-xs text-red-500">3-50 characters, lowercase, numbers, underscores only</p>}
              </div>

              <div className="space-y-4">
                <label className="text-[10px] uppercase tracking-widest text-white/40 font-mono">Bio</label>
                <textarea 
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  maxLength={500}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-4 md:py-3 focus:outline-none focus:border-accent transition-colors h-32 md:h-24 resize-none text-sm md:text-base"
                  placeholder="Tell us about yourself..."
                />
                <p className="text-right text-[10px] text-white/20">{editBio.length}/500</p>
              </div>

              <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                <div className="space-y-1 pr-4">
                  <div className="text-sm font-medium">Public Profile</div>
                  <div className="text-[10px] md:text-xs text-white/40">Allow others to see your profile and confessions</div>
                </div>
                <button 
                  onClick={() => setIsPublic(!isPublic)}
                  className={cn(
                    "w-12 h-6 rounded-full transition-all relative shrink-0",
                    isPublic ? "bg-accent" : "bg-white/10"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                    isPublic ? "left-7" : "left-1"
                  )} />
                </button>
              </div>

              {profile?.role === 'admin' && onViewChange && (
                <div className="p-4 bg-red-500/5 rounded-2xl border border-red-500/10 space-y-3">
                  <div className="flex items-center gap-2 text-red-500">
                    <Shield className="w-4 h-4" />
                    <span className="text-sm font-medium">Administrative Access</span>
                  </div>
                  <p className="text-[10px] md:text-xs text-white/40">You have administrator privileges. Access the dashboard to manage content and users.</p>
                  <button
                    onClick={() => onViewChange('admin')}
                    className="w-full py-2 bg-red-500 text-white rounded-xl text-xs font-bold hover:bg-red-600 transition-all"
                  >
                    Open Admin Dashboard
                  </button>
                </div>
              )}

              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 text-xs text-center animate-pulse">
                  {error}
                </div>
              )}

              <button 
                onClick={handleSaveSettings}
                disabled={saving || saveSuccess || (editUsername !== profile.username && usernameStatus !== 'available') || usernameStatus === 'invalid'}
                className={cn(
                  "w-full py-4 rounded-2xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm md:text-base",
                  saveSuccess ? "bg-green-500 text-white" : "bg-white text-black hover:bg-white/90"
                )}
              >
                {saving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : saveSuccess ? (
                  <>
                    <Check className="w-5 h-5" />
                    Changes Saved!
                  </>
                ) : (
                  "Save Changes"
                )}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
