import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
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

export default function ConfessionCard({ 
  confession, 
  isAdmin = false,
  onAction = () => {},
  onProfileClick = () => {}
}: { 
  confession: Confession, 
  isAdmin?: boolean,
  onAction?: () => void,
  onProfileClick?: (username: string) => void
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
    });
    return () => unsubscribe();
  }, [confession.id]);

  useEffect(() => {
    if (confession.poll && auth.currentUser) {
      const voters = confession.poll.voters || [];
      const hasVoted = voters.includes(auth.currentUser.uid);
      if (hasVoted) {
        // Find which option they voted for (simplified for prototype)
        setVotedPollOption(0); 
      }
    }
  }, [confession.poll]);

  useEffect(() => {
    if (!auth.currentUser || !confession.id) return;
    
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
  }, [confession.id]);

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
          handleFirestoreError(err, OperationType.UPDATE, `confessions/${confession.id}`);
        } else {
          console.error("Error incrementing view:", err);
        }
      }
    };
    incrementView();
  }, [confession.id]);

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
        <div key={comment.id} className={depth > 0 ? "ml-6 mt-3 border-l-2 border-white/5 pl-4" : "mt-4"}>
          <div className="flex items-start justify-between group/comment">
            <div className="flex-1">
              <div className="flex items-center gap-2 text-[10px] text-white/30 font-mono mb-1">
                <User className="w-2.5 h-2.5" />
                <span>anon#{comment.anonymousId}</span>
                <span>•</span>
                <span>{comment.createdAt?.toDate ? formatDistanceToNow(comment.createdAt.toDate()) : 'just now'}</span>
              </div>
              <p className="text-sm text-white/80">{comment.content}</p>
              <div className="flex items-center gap-3 mt-2">
                <button 
                  onClick={() => setReplyingTo(comment.id)}
                  className="text-[10px] text-white/20 hover:text-accent transition-colors flex items-center gap-1"
                >
                  <CornerDownRight className="w-2.5 h-2.5" />
                  Reply
                </button>
                {(isAdmin || (auth.currentUser && auth.currentUser.uid === comment.authorUid)) && (
                  <button 
                    onClick={() => handleDeleteComment(comment.id)}
                    className="text-[10px] text-white/10 hover:text-red-400 transition-colors opacity-0 group-hover/comment:opacity-100"
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
      className={cn("p-4 md:p-6 rounded-2xl border transition-all group relative overflow-hidden", themeStyles)}
    >
      <div className="flex items-center justify-between mb-3 md:mb-4">
        <div className="flex items-center gap-2 md:gap-3">
          {authorProfile && authorProfile.isPublic ? (
            <button 
              onClick={() => onProfileClick(authorProfile.username)}
              className="flex items-center gap-2 group/author"
            >
              <img 
                src={authorProfile.avatarUrl} 
                alt={authorProfile.username}
                className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-white/5 border border-white/10 group-hover/author:border-accent transition-colors"
                referrerPolicy="no-referrer"
              />
              <div className="flex flex-col items-start">
                <span className="text-[9px] md:text-[10px] text-white/60 font-mono group-hover/author:text-accent transition-colors">@{authorProfile.username}</span>
                <span className="text-[7px] md:text-[8px] text-white/20 uppercase tracking-widest">{formatDistanceToNow(confession.createdAt?.toDate ? confession.createdAt.toDate() : new Date())} ago</span>
              </div>
            </button>
          ) : (
            <div className="flex items-center gap-2 text-[10px] md:text-xs text-white/40 font-mono">
              <User className="w-3 h-3" />
              <span>{confession.persona || `anon#${confession.anonymousId}`}</span>
              <span className="mx-1">•</span>
              <Clock className="w-3 h-3" />
              <span>{confession.createdAt?.toDate ? formatDistanceToNow(confession.createdAt.toDate()) : 'just now'} ago</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {auth.currentUser && (
            <button 
              onClick={handleToggleSave}
              className={cn(
                "p-1.5 rounded-lg transition-colors",
                isSaved ? "text-accent bg-accent/10" : "text-white/20 hover:text-white/40 hover:bg-white/5"
              )}
            >
              {isSaved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
            </button>
          )}
          {confession.isPrivate && (
            <span className="px-2 py-0.5 rounded-full bg-accent/20 text-[10px] uppercase tracking-wider text-accent border border-accent/30 flex items-center gap-1">
              <ShieldAlert className="w-2 h-2" />
              Private
            </span>
          )}
          {confession.community && confession.community.type !== 'General' && (
            <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-[10px] uppercase tracking-wider text-blue-400 border border-blue-500/20">
              {confession.community.name}
            </span>
          )}
          <span className="px-2 py-0.5 rounded-full bg-white/5 text-[10px] uppercase tracking-wider text-white/60 border border-white/10 flex items-center gap-1.5">
            <span>{MOOD_EMOJIS[confession.mood] || '✨'}</span>
            {confession.category}
          </span>
        </div>
      </div>

      <div className="mb-6">
        <p className={cn(
          "text-lg font-serif leading-relaxed whitespace-pre-wrap",
          confession.theme === 'dark' ? "text-white/80" : "text-white/90"
        )}>
          {confession.content}
        </p>

        {confession.audioUrl && (
          <div className="mt-4 p-3 bg-white/5 rounded-xl border border-white/10 flex items-center gap-4">
            <button
              onClick={toggleAudio}
              className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-white hover:scale-105 transition-transform"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Audio Confession</span>
                <Volume2 className="w-3 h-3 text-white/20" />
              </div>
              <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-accent"
                  animate={{ width: isPlaying ? '100%' : '0%' }}
                  transition={{ duration: isPlaying ? 30 : 0, ease: "linear" }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Poll Section */}
      {confession.poll && (
        <div className="mb-6 p-6 rounded-2xl bg-white/5 border border-white/10 space-y-4">
          <div className="flex items-center gap-2 text-[10px] text-accent font-mono uppercase tracking-widest">
            <BarChart3 className="w-3 h-3" />
            Community Poll
          </div>
          <h4 className="text-sm font-medium text-white/90">{confession.poll.question}</h4>
          <div className="space-y-2">
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
                    "w-full relative h-10 rounded-xl border transition-all overflow-hidden text-left px-4 group",
                    votedPollOption !== null ? "cursor-default" : "hover:border-accent/50",
                    isVoted ? "border-accent bg-accent/5" : "border-white/5 bg-white/5"
                  )}
                >
                  {votedPollOption !== null && (
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      className={cn(
                        "absolute inset-0 opacity-20",
                        isVoted ? "bg-accent" : "bg-white"
                      )}
                    />
                  )}
                  <div className="relative z-10 flex items-center justify-between h-full text-xs">
                    <span className={cn(isVoted ? "text-accent font-bold" : "text-white/70")}>{opt.text}</span>
                    {votedPollOption !== null && (
                      <span className="text-[10px] font-mono text-white/40">{percentage}%</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          {votedPollOption !== null && (
            <div className="text-[10px] text-white/20 text-center font-mono uppercase tracking-widest">
              {confession.poll.options.reduce((acc, o) => acc + o.votes, 0)} total votes
            </div>
          )}
        </div>
      )}

      {/* Reactions Display */}
      <div className="flex flex-wrap gap-1.5 md:gap-2 mb-4 md:mb-6">
        {(Object.keys(REACTION_CONFIG) as ReactionType[]).map((type) => {
          const count = confession.reactions?.[type] || 0;
          const isUserReaction = userReaction === type;
          if (count === 0 && !isAdmin && !isUserReaction) return null;
          return (
            <div 
              key={type}
              className={cn(
                "flex items-center gap-1 md:gap-1.5 px-1.5 md:px-2 py-0.5 md:py-1 rounded-lg border text-[10px] md:text-xs transition-all",
                isUserReaction 
                  ? "bg-accent/20 border-accent/40 text-accent font-bold" 
                  : "bg-white/5 border-white/5 text-white/60"
              )}
            >
              <span>{REACTION_CONFIG[type].emoji}</span>
              <span className="font-mono">{count}</span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-3 md:pt-4 border-t border-white/5">
        <div className="flex items-center gap-2 md:gap-4">
          {isAdmin ? (
            <>
              <button 
                onClick={() => handleAdminAction('published')}
                className="flex items-center gap-1.5 text-xs font-medium text-green-400 hover:text-green-300 transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                Approve
              </button>
              <button 
                onClick={() => handleAdminAction('hidden')}
                className="flex items-center gap-1.5 text-xs font-medium text-red-400 hover:text-red-300 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Remove
              </button>
            </>
          ) : (
            <div className="flex items-center gap-4">
              <div className="relative">
                <button 
                  onClick={() => setIsReacting(!isReacting)}
                  className="flex items-center gap-1.5 text-xs font-medium text-white/40 hover:text-accent transition-colors"
                >
                  <span className="text-base">✨</span>
                  React
                </button>

                <AnimatePresence>
                  {isReacting && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.9 }}
                      className="absolute bottom-full left-0 mb-2 glass p-2 rounded-xl border border-white/10 flex gap-2 z-20"
                    >
                      {(Object.keys(REACTION_CONFIG) as ReactionType[]).map((type) => (
                        <button
                          key={type}
                          onClick={() => handleReaction(type)}
                          className={cn(
                            "p-2 rounded-lg transition-all text-xl",
                            userReaction === type ? "bg-accent/20 scale-110" : "hover:bg-white/10"
                          )}
                          title={REACTION_CONFIG[type].label}
                        >
                          {REACTION_CONFIG[type].emoji}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <button 
                onClick={() => setShowComments(!showComments)}
                className={cn(
                  "flex items-center gap-1.5 text-xs font-medium transition-colors",
                  showComments ? "text-accent" : "text-white/40 hover:text-white"
                )}
              >
                <MessageCircle className="w-4 h-4" />
                {confession.commentsCount || 0}
              </button>

              <button 
                onClick={() => setShowChat(!showChat)}
                className={cn(
                  "flex items-center gap-1.5 text-xs font-medium transition-colors",
                  showChat ? "text-accent" : "text-white/40 hover:text-white"
                )}
                title="Private Anonymous Chat"
              >
                <MessageSquare className="w-4 h-4" />
                Chat
              </button>

              <div className="flex items-center gap-1.5 text-xs font-medium text-white/20">
                <Eye className="w-4 h-4" />
                {confession.viewsCount || 0}
              </div>

              <button 
                onClick={() => setIsReporting(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-white/10 hover:text-red-400 transition-colors"
              >
                <Flag className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        
        {confession.reportsCount > 0 && (
          <div className="flex items-center gap-1 text-[10px] text-yellow-500/60 font-mono">
            <ShieldAlert className="w-3 h-3" />
            {confession.reportsCount}
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
            className="mt-6 pt-6 border-t border-white/5 overflow-hidden"
          >
            <form onSubmit={handleAddComment} className="mb-6">
              {replyingTo && (
                <div className="flex items-center justify-between bg-white/5 px-3 py-1.5 rounded-t-xl border-x border-t border-white/10">
                  <span className="text-[10px] text-white/40">Replying to a comment...</span>
                  <button onClick={() => setReplyingTo(null)} className="text-[10px] text-accent hover:underline">Cancel</button>
                </div>
              )}
              <div className="flex gap-2">
                <input 
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment..."
                  className={cn(
                    "flex-1 bg-white/5 border border-white/10 p-3 text-sm focus:outline-none focus:border-accent/50 transition-colors",
                    replyingTo ? "rounded-b-xl" : "rounded-xl"
                  )}
                />
                <button 
                  type="submit"
                  disabled={!newComment.trim()}
                  className="bg-accent text-white p-3 rounded-xl disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>

            <div className="max-h-60 overflow-y-auto no-scrollbar">
              {comments.length === 0 ? (
                <p className="text-center text-xs text-white/20 italic py-4">No comments yet. Be the first to reply.</p>
              ) : (
                renderComments()
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isReporting && (
        <div className="absolute inset-0 bg-black/90 backdrop-blur-sm p-6 flex flex-col justify-center items-center text-center z-10">
          <h4 className="text-lg font-serif italic mb-4">Why are you reporting this?</h4>
          <input 
            type="text"
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
            placeholder="Reason (e.g., Spam, Hate speech)"
            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 mb-4 focus:outline-none focus:border-accent"
          />
          <div className="flex gap-3 w-full">
            <button 
              onClick={handleReport}
              className="flex-1 bg-accent text-white py-2 rounded-xl text-sm font-medium"
            >
              Submit Report
            </button>
            <button 
              onClick={() => setIsReporting(false)}
              className="flex-1 bg-white/10 text-white py-2 rounded-xl text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
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
