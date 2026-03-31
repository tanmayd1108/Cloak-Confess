import React, { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { doc, updateDoc, addDoc, collection, serverTimestamp, increment, query, where, orderBy, onSnapshot, deleteDoc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { Confession, ReactionType, Comment, UserProfile, ConfessionMood } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Flag, Trash2, CheckCircle, ShieldAlert, Clock, User, MessageCircle, Eye, CornerDownRight, Send, Play, Pause, Volume2, Bookmark, BookmarkCheck, BarChart3, MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import ConfessionMatch from './ConfessionMatch';
import AnonymousChat from './AnonymousChat';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const REACTION_CONFIG: Record<ReactionType, { emoji: string, label: string }> = {
  relatable: { emoji: '😭', label: 'Relatable' },
  dead: { emoji: '💀', label: 'Dead' },
  shocking: { emoji: '🤯', label: 'Shocking' },
  love: { emoji: '❤️', label: 'Love' }
};

const MOOD_EMOJIS: Record<ConfessionMood, string> = {
  sad: '😭',
  love: '❤️',
  drama: '🤯',
  funny: '😂',
  angry: '💢',
  scary: '👻'
};

export default function ConfessionCard({ 
  confession, 
  isAdmin = false,
  onAction = () => {},
  onProfileClick = () => {},
  currentUserProfile = null
}: { 
  confession: Confession, 
  isAdmin?: boolean,
  onAction?: () => void,
  onProfileClick?: (username: string) => void,
  currentUserProfile?: UserProfile | null
}) {
  const [isReporting, setIsReporting] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [isReacting, setIsReacting] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [authorProfile, setAuthorProfile] = useState<UserProfile | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [votedPollOption, setVotedPollOption] = useState<number | null>(null);
  const [userReaction, setUserReaction] = useState<ReactionType | null>(null);

  useEffect(() => {
    const fetchAuthor = async () => {
      if (!confession.authorUid) return;
      try {
        const docRef = doc(db, 'users', confession.authorUid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setAuthorProfile(docSnap.data() as UserProfile);
        }
      } catch (err) {
        console.error("Error fetching author profile:", err);
      }
    };
    fetchAuthor();
  }, [confession.authorUid]);

  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(
      collection(db, 'saved_confessions'),
      where('uid', '==', auth.currentUser.uid),
      where('confessionId', '==', confession.id)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setIsSaved(!snapshot.empty);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'saved_confessions');
    });
    return () => unsubscribe();
  }, [confession.id, auth.currentUser?.uid]);

  useEffect(() => {
    if (confession.poll && auth.currentUser) {
      const voters = confession.poll.voters || [];
      const hasVoted = voters.includes(auth.currentUser.uid);
      if (hasVoted) {
        // Find which option they voted for (simplified for prototype)
        setVotedPollOption(0); 
      }
    }
  }, [confession.poll, auth.currentUser?.uid]);

  useEffect(() => {
    if (!auth.currentUser || !confession.id) {
      setUserReaction(null);
      return;
    }
    
    const reactionId = `${confession.id}_${auth.currentUser.uid}`;
    const reactionRef = doc(db, 'confession_reactions', reactionId);
    
    const unsubscribe = onSnapshot(reactionRef, (docSnap) => {
      if (docSnap.exists()) {
        setUserReaction(docSnap.data().type as ReactionType);
      } else {
        setUserReaction(null);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `confession_reactions/${reactionId}`);
    });
    
    return () => unsubscribe();
  }, [confession.id, auth.currentUser?.uid]);

  const handlePollVote = async (optionIdx: number) => {
    if (!auth.currentUser || votedPollOption !== null || !confession.poll) return;
    
    try {
      const confessionRef = doc(db, 'confessions', confession.id);
      const newOptions = [...(confession.poll.options || [])];
      if (newOptions[optionIdx]) {
        newOptions[optionIdx].votes += 1;
      }
      
      const voters = confession.poll.voters || [];
      await updateDoc(confessionRef, {
        'poll.options': newOptions,
        'poll.voters': [...voters, auth.currentUser.uid],
        score: increment(5)
      });
      setVotedPollOption(optionIdx);
    } catch (err) {
      console.error("Error voting in poll:", err);
    }
  };

  const handleToggleSave = async () => {
    if (!auth.currentUser) return;
    try {
      const q = query(
        collection(db, 'saved_confessions'),
        where('uid', '==', auth.currentUser.uid),
        where('confessionId', '==', confession.id)
      );
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        await addDoc(collection(db, 'saved_confessions'), {
          uid: auth.currentUser.uid,
          confessionId: confession.id,
          savedAt: serverTimestamp()
        });
      } else {
        await deleteDoc(doc(db, 'saved_confessions', snapshot.docs[0].id));
      }
    } catch (err) {
      console.error("Error toggling save:", err);
    }
  };

  useEffect(() => {
    if (confession.audioUrl) {
      const a = new Audio(confession.audioUrl);
      a.onended = () => setIsPlaying(false);
      setAudio(a);
    }
    return () => {
      if (audio) {
        audio.pause();
      }
    };
  }, [confession.audioUrl]);

  const toggleAudio = () => {
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  useEffect(() => {
    // Increment view count once when card is shown
    const incrementView = async () => {
      if (!auth.currentUser) return;
      try {
        const confessionRef = doc(db, 'confessions', confession.id);
        await updateDoc(confessionRef, {
          viewsCount: increment(1)
        });

        // Also increment author's total views
        if (confession.authorUid) {
          const authorRef = doc(db, 'users', confession.authorUid);
          await updateDoc(authorRef, {
            'stats.totalViews': increment(1)
          });
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('insufficient permissions')) {
          // Silent fail for views to not disrupt UX, but log it
          console.warn("Permission denied for incrementView on confession:", confession.id);
        } else {
          console.error("Error incrementing view:", err);
        }
      }
    };
    incrementView();
  }, [confession.id, auth.currentUser?.uid]);

  useEffect(() => {
    if (!showComments) return;

    const q = query(
      collection(db, 'comments'),
      where('confessionId', '==', confession.id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Comment));
      // Sort client-side
      data.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(0);
        const dateB = b.createdAt?.toDate?.() || new Date(0);
        return dateA.getTime() - dateB.getTime(); // Ascending for comments
      });
      setComments(data);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'comments');
    });

    return () => unsubscribe();
  }, [showComments, confession.id]);

  const handleReport = async () => {
    if (!reportReason.trim()) return;
    try {
      const confessionRef = doc(db, 'confessions', confession.id);
      const newReportsCount = confession.reportsCount + 1;
      
      await updateDoc(confessionRef, {
        reportsCount: increment(1),
        status: newReportsCount >= 5 ? 'hidden' : confession.status
      });

      await addDoc(collection(db, 'reports'), {
        confessionId: confession.id,
        reason: reportReason,
        createdAt: serverTimestamp()
      });

      setIsReporting(false);
      onAction();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `confessions/${confession.id}`);
    }
  };

  const handleReaction = async (type: ReactionType) => {
    if (!auth.currentUser) return;
    try {
      const confessionRef = doc(db, 'confessions', confession.id);
      const reactionId = `${confession.id}_${auth.currentUser.uid}`;
      const reactionRef = doc(db, 'confession_reactions', reactionId);
      
      if (userReaction === type) {
        // Remove reaction
        await deleteDoc(reactionRef);
        await updateDoc(confessionRef, {
          [`reactions.${type}`]: increment(-1),
          score: increment(-2)
        });
        
        if (confession.authorUid) {
          const authorRef = doc(db, 'users', confession.authorUid);
          await updateDoc(authorRef, {
            'stats.totalLikes': increment(-1)
          });
        }
      } else if (userReaction) {
        // Switch reaction
        const oldType = userReaction;
        await setDoc(reactionRef, {
          confessionId: confession.id,
          userId: auth.currentUser.uid,
          type,
          createdAt: serverTimestamp()
        });
        
        await updateDoc(confessionRef, {
          [`reactions.${oldType}`]: increment(-1),
          [`reactions.${type}`]: increment(1)
        });
        // Score stays the same as it's just a switch
      } else {
        // Add new reaction
        await setDoc(reactionRef, {
          confessionId: confession.id,
          userId: auth.currentUser.uid,
          type,
          createdAt: serverTimestamp()
        });
        
        await updateDoc(confessionRef, {
          [`reactions.${type}`]: increment(1),
          score: increment(2)
        });

        if (confession.authorUid) {
          const authorRef = doc(db, 'users', confession.authorUid);
          await updateDoc(authorRef, {
            'stats.totalLikes': increment(1)
          });
        }
      }
      setIsReacting(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `confessions/${confession.id}`);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !auth.currentUser) return;

    try {
      const anonymousId = Math.random().toString(36).substring(2, 10);
      await addDoc(collection(db, 'comments'), {
        confessionId: confession.id,
        parentCommentId: replyingTo,
        content: newComment,
        authorUid: auth.currentUser.uid,
        authorUsername: currentUserProfile?.username || null,
        anonymousId,
        createdAt: serverTimestamp()
      });

      await updateDoc(doc(db, 'confessions', confession.id), {
        commentsCount: increment(1),
        score: increment(1)
      });

      setNewComment('');
      setReplyingTo(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `comments`);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await deleteDoc(doc(db, 'comments', commentId));
      await updateDoc(doc(db, 'confessions', confession.id), {
        commentsCount: increment(-1),
        score: increment(-1)
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `comments/${commentId}`);
    }
  };

  const handleAdminAction = async (newStatus: 'published' | 'hidden') => {
    try {
      await updateDoc(doc(db, 'confessions', confession.id), {
        status: newStatus,
        reportsCount: 0
      });
      onAction();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `confessions/${confession.id}`);
    }
  };

  const renderComments = (parentId: string | null = null, depth = 0) => {
    return comments
      .filter(c => c.parentCommentId === parentId)
      .map(comment => (
        <div key={comment.id} className={depth > 0 ? "ml-8 mt-4 border-l-2 border-accent/10 pl-6 relative" : "mt-6"}>
          {depth > 0 && (
            <div className="absolute top-4 left-0 w-4 h-0.5 bg-accent/10 -ml-0.5" />
          )}
          <div className="flex items-start justify-between group/comment">
            <div className="flex-1">
              <div className="flex items-center gap-3 text-[10px] text-white/30 font-mono mb-2">
                <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center border border-white/5">
                  <User className="w-3 h-3 text-accent/40" />
                </div>
                <div className="flex flex-col">
                  <button 
                    onClick={() => comment.authorUsername && onProfileClick(comment.authorUsername)}
                    className="text-white/50 font-bold tracking-tight hover:text-accent transition-colors text-left"
                  >
                    {comment.authorUsername ? `@${comment.authorUsername}` : `anon#${comment.anonymousId}`}
                  </button>
                  <span className="text-[8px] opacity-50 uppercase tracking-widest">{comment.createdAt?.toDate ? formatDistanceToNow(comment.createdAt.toDate()) : 'just now'} ago</span>
                </div>
              </div>
              <p className="text-sm text-white/80 leading-relaxed bg-white/[0.02] p-3 rounded-2xl border border-white/5">{comment.content}</p>
              <div className="flex items-center gap-4 mt-2 ml-2">
                <button 
                  onClick={() => setReplyingTo(comment.id)}
                  className="text-[10px] text-white/20 hover:text-accent transition-colors flex items-center gap-1.5 font-bold uppercase tracking-wider"
                >
                  <CornerDownRight className="w-3 h-3" />
                  Reply
                </button>
                {(isAdmin || (auth.currentUser && auth.currentUser.uid === comment.authorUid)) && (
                  <button 
                    onClick={() => handleDeleteComment(comment.id)}
                    className="text-[10px] text-white/10 hover:text-red-400 transition-colors opacity-0 group-hover/comment:opacity-100 font-bold uppercase tracking-wider"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
          {renderComments(comment.id, depth + 1)}
        </div>
      ));
  };

  const themeStyles = {
    default: "glass border-white/5 hover:border-accent/20",
    sad: "bg-blue-900/40 border-blue-500/30 backdrop-blur-md hover:border-blue-400/50",
    aesthetic: "bg-purple-900/40 border-purple-500/30 backdrop-blur-md hover:border-purple-400/50",
    neon: "bg-pink-900/40 border-pink-500/30 backdrop-blur-md shadow-[0_0_15px_rgba(236,72,153,0.2)] hover:border-pink-400/50",
    dark: "bg-black border-white/5 hover:border-white/20",
  }[confession.theme || 'default'];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className={cn(
        "p-5 md:p-10 rounded-[1.5rem] md:rounded-[2.5rem] border transition-all group relative overflow-hidden",
        "shadow-xl hover:shadow-2xl hover:shadow-accent/5",
        themeStyles
      )}
    >
      {/* Background Glow Effect */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-accent/5 blur-[100px] rounded-full pointer-events-none group-hover:bg-accent/10 transition-colors" />
      
      <div className="flex items-center justify-between mb-6 md:mb-8 relative z-10">
        <div className="flex items-center gap-3 md:gap-5">
          {authorProfile && authorProfile.isPublic ? (
            <button 
              onClick={() => onProfileClick(authorProfile.username)}
              className="flex items-center gap-2 md:gap-4 group/author"
            >
              <div className="relative">
                <img 
                  src={authorProfile.avatarUrl} 
                  alt={authorProfile.username}
                  className="w-8 h-8 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-white/5 border border-white/10 group-hover/author:border-accent transition-all duration-300"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 border-2 border-black rounded-full" />
              </div>
              <div className="flex flex-col items-start">
                <span className="text-[10px] md:text-sm text-white/80 font-mono group-hover/author:text-accent transition-colors">@{authorProfile.username}</span>
                <span className="text-[8px] md:text-[11px] text-white/30 uppercase tracking-[0.2em] font-mono">{formatDistanceToNow(confession.createdAt?.toDate ? confession.createdAt.toDate() : new Date())} ago</span>
              </div>
            </button>
          ) : (
            <div className="flex items-center gap-2 text-[9px] md:text-xs text-white/40 font-mono bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
              <User className="w-3 h-3 text-accent/60" />
              <span className="tracking-tight">{confession.persona || `anon#${confession.anonymousId}`}</span>
              <span className="text-white/10">•</span>
              <Clock className="w-3 h-3 text-white/20" />
              <span className="tracking-tight">{confession.createdAt?.toDate ? formatDistanceToNow(confession.createdAt.toDate()) : 'just now'} ago</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 md:gap-3">
          {auth.currentUser && (
            <button 
              onClick={handleToggleSave}
              className={cn(
                "p-2 md:p-2.5 rounded-xl md:rounded-2xl transition-all duration-300",
                isSaved 
                  ? "text-accent bg-accent/10 border border-accent/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]" 
                  : "text-white/20 hover:text-white/60 hover:bg-white/5 border border-transparent hover:border-white/10"
              )}
            >
              {isSaved ? <BookmarkCheck className="w-4 h-4 md:w-5 md:h-5" /> : <Bookmark className="w-4 h-4 md:w-5 md:h-5" />}
            </button>
          )}
          {confession.isPrivate && (
            <span className="px-3 py-1 rounded-full bg-accent/10 text-[8px] md:text-[10px] uppercase tracking-[0.15em] text-accent border border-accent/20 flex items-center gap-1.5 font-mono shadow-sm">
              <ShieldAlert className="w-2.5 h-2.5" />
              Private
            </span>
          )}
          {confession.community && confession.community.type !== 'General' && (
            <span className="px-3 py-1 rounded-full bg-blue-500/10 text-[8px] md:text-[10px] uppercase tracking-[0.15em] text-blue-400 border border-blue-500/20 font-mono">
              {confession.community.name}
            </span>
          )}
          <span className="px-3 py-1 rounded-full bg-white/5 text-[8px] md:text-[10px] uppercase tracking-[0.15em] text-white/60 border border-white/10 flex items-center gap-1.5 font-mono">
            <span className="text-xs">{MOOD_EMOJIS[confession.mood] || '✨'}</span>
            {confession.category}
          </span>
        </div>
      </div>

      <div className="mb-6 md:mb-10 relative z-10">
        <p className={cn(
          "text-lg md:text-3xl font-serif leading-[1.6] whitespace-pre-wrap tracking-tight",
          confession.theme === 'dark' ? "text-white/80" : "text-white/95"
        )}>
          {confession.content}
        </p>

        {confession.audioUrl && (
          <div className="mt-6 md:mt-8 p-4 md:p-5 bg-white/5 rounded-2xl md:rounded-3xl border border-white/10 flex items-center gap-4 md:gap-5 group/audio-player transition-all hover:bg-white/10">
            <button
              onClick={toggleAudio}
              className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-accent flex items-center justify-center text-white hover:scale-105 active:scale-95 transition-all shadow-lg shadow-accent/20"
            >
              {isPlaying ? <Pause className="w-5 h-5 md:w-6 md:h-6" /> : <Play className="w-5 h-5 md:w-6 md:h-6 ml-1" />}
            </button>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1.5 md:mb-2">
                <span className="text-[9px] md:text-[10px] font-mono text-white/40 uppercase tracking-[0.2em]">Voice Confession</span>
                <div className="flex items-center gap-2">
                  <Volume2 className="w-3 h-3 md:w-3.5 md:h-3.5 text-white/20" />
                  <span className="text-[8px] md:text-[9px] font-mono text-white/20">0:30</span>
                </div>
              </div>
              <div className="h-1 md:h-1.5 bg-white/10 rounded-full overflow-hidden relative">
                <motion.div 
                  className="h-full bg-gradient-to-r from-accent to-red-400 relative z-10"
                  animate={{ width: isPlaying ? '100%' : '0%' }}
                  transition={{ duration: isPlaying ? 30 : 0, ease: "linear" }}
                />
                <div className="absolute inset-0 flex justify-between px-1 opacity-20">
                  {[...Array(20)].map((_, i) => (
                    <div key={i} className="w-0.5 h-full bg-white/50" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Poll Section */}
      {confession.poll && (
        <div className="mb-8 p-8 rounded-[2rem] bg-white/[0.03] border border-white/10 space-y-6 relative z-10 overflow-hidden group/poll">
          <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 blur-3xl rounded-full -mr-16 -mt-16" />
          
          <div className="flex items-center gap-3 text-[11px] text-accent font-mono uppercase tracking-[0.2em]">
            <BarChart3 className="w-4 h-4" />
            Community Poll
          </div>
          <h4 className="text-lg md:text-xl font-medium text-white/95 leading-snug">{confession.poll.question}</h4>
          <div className="space-y-3">
            {confession.poll.options.map((opt, idx) => {
              const totalVotes = confession.poll?.options.reduce((acc, o) => acc + o.votes, 0) || 1;
              const percentage = Math.round((opt.votes / (totalVotes || 1)) * 100);
              const isVoted = votedPollOption === idx;

              return (
                <button
                  key={idx}
                  disabled={votedPollOption !== null}
                  onClick={() => handlePollVote(idx)}
                  className={cn(
                    "w-full relative h-14 rounded-2xl border transition-all duration-500 overflow-hidden text-left px-6 group/option",
                    votedPollOption !== null ? "cursor-default" : "hover:border-accent/50 hover:bg-white/5",
                    isVoted ? "border-accent bg-accent/10" : "border-white/5 bg-white/5"
                  )}
                >
                  {votedPollOption !== null && (
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      className={cn(
                        "absolute inset-0 opacity-10",
                        isVoted ? "bg-accent" : "bg-white"
                      )}
                    />
                  )}
                  <div className="relative z-10 flex items-center justify-between h-full">
                    <div className="flex items-center gap-3">
                      {isVoted && <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />}
                      <span className={cn(
                        "text-sm transition-colors",
                        isVoted ? "text-accent font-semibold" : "text-white/70 group-hover/option:text-white"
                      )}>
                        {opt.text}
                      </span>
                    </div>
                    {votedPollOption !== null && (
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-white/40">{percentage}%</span>
                        <div className="w-8 h-1 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full bg-white/40" style={{ width: `${percentage}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          {votedPollOption !== null && (
            <div className="text-[11px] text-white/20 text-center font-mono uppercase tracking-[0.2em] pt-2">
              {confession.poll.options.reduce((acc, o) => acc + o.votes, 0)} total votes • Results are anonymous
            </div>
          )}
        </div>
      )}

      {/* Reactions Display */}
      <div className="flex flex-wrap gap-2 md:gap-3 mb-6 md:mb-8 relative z-10">
        {(Object.keys(REACTION_CONFIG) as ReactionType[]).map((type) => {
          const count = confession.reactions?.[type] || 0;
          const isUserReaction = userReaction === type;
          if (count === 0 && !isAdmin && !isUserReaction) return null;
          return (
            <motion.div 
              key={type}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs transition-all duration-300",
                isUserReaction 
                  ? "bg-accent/10 border-accent/30 text-accent font-bold shadow-[0_0_15px_rgba(239,68,68,0.05)]" 
                  : "bg-white/[0.03] border-white/5 text-white/50"
              )}
            >
              <span className="text-sm">{REACTION_CONFIG[type].emoji}</span>
              <span className="font-mono tracking-tighter">{count}</span>
            </motion.div>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-6 md:pt-8 border-t border-white/5 relative z-10">
        <div className="flex items-center gap-3 md:gap-6">
          {isAdmin ? (
            <div className="flex items-center gap-3">
              <button 
                onClick={() => handleAdminAction('published')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500/10 text-xs font-semibold text-green-400 hover:bg-green-500/20 transition-all border border-green-500/20"
              >
                <CheckCircle className="w-4 h-4" />
                Approve
              </button>
              <button 
                onClick={() => handleAdminAction('hidden')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition-all border border-red-500/20"
              >
                <Trash2 className="w-4 h-4" />
                Remove
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 md:gap-6">
              <div className="relative">
                <button 
                  onClick={() => setIsReacting(!isReacting)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 text-xs font-semibold",
                    isReacting ? "bg-accent/10 text-accent" : "text-white/40 hover:text-white hover:bg-white/5"
                  )}
                >
                  <span className="text-lg">✨</span>
                  React
                </button>

                <AnimatePresence>
                  {isReacting && (
                    <motion.div
                      initial={{ opacity: 0, y: 15, scale: 0.9, x: -20 }}
                      animate={{ opacity: 1, y: 0, scale: 1, x: -20 }}
                      exit={{ opacity: 0, y: 15, scale: 0.9, x: -20 }}
                      className="absolute bottom-full left-0 mb-4 glass p-3 rounded-[1.5rem] border border-white/10 flex gap-3 z-30 shadow-2xl shadow-black/50"
                    >
                      {(Object.keys(REACTION_CONFIG) as ReactionType[]).map((type) => (
                        <button
                          key={type}
                          onClick={() => handleReaction(type)}
                          className={cn(
                            "p-3 rounded-2xl transition-all text-2xl relative group/emoji",
                            userReaction === type ? "bg-accent/20 scale-110" : "hover:bg-white/10 hover:scale-110"
                          )}
                        >
                          {REACTION_CONFIG[type].emoji}
                          <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-black/80 text-[10px] text-white rounded-lg opacity-0 group-hover/emoji:opacity-100 transition-opacity whitespace-nowrap pointer-events-none font-mono uppercase tracking-widest">
                            {REACTION_CONFIG[type].label}
                          </span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <button 
                onClick={() => setShowComments(!showComments)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 text-xs font-semibold",
                  showComments ? "bg-accent/10 text-accent" : "text-white/40 hover:text-white hover:bg-white/5"
                )}
              >
                <MessageCircle className="w-4 h-4" />
                {confession.commentsCount || 0}
              </button>

              <button 
                onClick={() => setShowChat(!showChat)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 text-xs font-semibold",
                  showChat ? "bg-accent/10 text-accent" : "text-white/40 hover:text-white hover:bg-white/5"
                )}
                title="Private Anonymous Chat"
              >
                <MessageSquare className="w-4 h-4" />
                Chat
              </button>

              <div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white/20">
                <Eye className="w-4 h-4" />
                {confession.viewsCount || 0}
              </div>

              <button 
                onClick={() => setIsReporting(true)}
                className="p-2 rounded-xl text-white/10 hover:text-red-400 hover:bg-red-400/5 transition-all"
                title="Report Confession"
              >
                <Flag className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        
        {confession.reportsCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-yellow-500/10 text-[10px] text-yellow-500/60 font-mono border border-yellow-500/20">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>{confession.reportsCount} Reports</span>
          </div>
        )}
      </div>

      {/* Comments Section */}
      <AnimatePresence>
        {showComments && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-8 pt-8 border-t border-white/5 overflow-hidden relative z-10"
          >
            <form onSubmit={handleAddComment} className="mb-8">
              {replyingTo && (
                <div className="flex items-center justify-between bg-accent/5 px-4 py-2 rounded-t-2xl border-x border-t border-accent/20">
                  <span className="text-[10px] text-accent font-mono uppercase tracking-widest">Replying to a comment</span>
                  <button onClick={() => setReplyingTo(null)} className="text-[10px] text-accent hover:underline font-bold">Cancel</button>
                </div>
              )}
              <div className="flex gap-3">
                <input 
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Share your thoughts anonymously..."
                  className={cn(
                    "flex-1 bg-white/5 border border-white/10 p-4 text-sm focus:outline-none focus:border-accent/50 transition-all placeholder:text-white/20",
                    replyingTo ? "rounded-b-2xl" : "rounded-2xl"
                  )}
                />
                <button 
                  type="submit"
                  disabled={!newComment.trim()}
                  className="bg-accent text-white px-6 rounded-2xl disabled:opacity-50 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-accent/20"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </form>

            <div className="max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {comments.length === 0 ? (
                <div className="text-center py-12 px-6">
                  <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                    <MessageSquare className="w-6 h-6 text-white/10" />
                  </div>
                  <p className="text-sm text-white/30 italic">No comments yet. Be the first to reply.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {renderComments()}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isReporting && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/95 backdrop-blur-md p-8 flex flex-col justify-center items-center text-center z-50"
          >
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
              <Flag className="w-8 h-8 text-red-500" />
            </div>
            <h4 className="text-2xl font-serif italic mb-2 text-white">Report Content</h4>
            <p className="text-sm text-white/40 mb-8 max-w-xs">Help us keep the community safe. Why are you reporting this confession?</p>
            
            <div className="w-full max-w-sm space-y-4">
              <input 
                type="text"
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder="Reason (e.g., Spam, Hate speech, Harassment)"
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm focus:outline-none focus:border-accent transition-all"
                autoFocus
              />
              <div className="flex gap-4">
                <button 
                  onClick={handleReport}
                  disabled={!reportReason.trim()}
                  className="flex-1 bg-accent text-white py-4 rounded-2xl text-sm font-bold shadow-lg shadow-accent/20 disabled:opacity-50 transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  Submit Report
                </button>
                <button 
                  onClick={() => setIsReporting(false)}
                  className="flex-1 bg-white/10 text-white py-4 rounded-2xl text-sm font-bold hover:bg-white/20 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Match Section */}
      {showComments && (
        <ConfessionMatch 
          currentConfession={confession} 
          onConfessionClick={(c) => {
            // In a real app, we might navigate or scroll. 
            // For now, let's just show it.
            console.log("Clicked match:", c);
          }} 
        />
      )}

      {/* Anonymous Chat */}
      <AnimatePresence>
        {showChat && (
          <AnonymousChat 
            confessionId={confession.id}
            receiverUid={confession.authorUid}
            onClose={() => setShowChat(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
