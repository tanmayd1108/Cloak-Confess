import React, { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc, or, and } from 'firebase/firestore';
import { PrivateMessage, UserProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Shield, RefreshCw, MessageSquare, X, User, Bot } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface AnonymousChatProps {
  confessionId: string;
  receiverUid: string;
  onClose: () => void;
}

export default function AnonymousChat({ confessionId, receiverUid, onClose }: AnonymousChatProps) {
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!auth.currentUser) return;

    // Fetch messages where current user is either sender or receiver
    const q = query(
      collection(db, 'private_messages'),
      and(
        where('confessionId', '==', confessionId),
        or(
          where('senderUid', '==', auth.currentUser.uid),
          where('receiverUid', '==', auth.currentUser.uid)
        )
      )
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as PrivateMessage))
        .filter(m => 
          (m.senderUid === auth.currentUser?.uid && m.receiverUid === receiverUid) ||
          (m.senderUid === receiverUid && m.receiverUid === auth.currentUser?.uid)
        );
      
      // Sort client-side
      msgs.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(0);
        const dateB = b.createdAt?.toDate?.() || new Date(0);
        return dateA.getTime() - dateB.getTime();
      });

      setMessages(msgs);
      setLoading(false);
    }, (err) => {
      console.error("Chat snapshot error:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [confessionId, receiverUid]);

  const [error, setError] = useState<string | null>(null);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !auth.currentUser || sending) return;

    // Safety rules: No links, auto-moderation
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    if (urlRegex.test(newMessage)) {
      setError("Safety first: Links are not allowed in private chats.");
      setTimeout(() => setError(null), 3000);
      return;
    }

    setSending(true);
    setError(null);
    try {
      await addDoc(collection(db, 'private_messages'), {
        confessionId,
        senderUid: auth.currentUser.uid,
        receiverUid,
        content: newMessage.trim(),
        createdAt: serverTimestamp()
      });
      setNewMessage('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'private_messages');
    } finally {
      setSending(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed bottom-6 right-6 w-full max-w-sm z-[100] glass rounded-3xl border border-white/10 shadow-2xl flex flex-col h-[500px] overflow-hidden"
    >
      <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent">
            <User className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-mono uppercase tracking-widest text-white/90">Anonymous Chat</div>
            <div className="text-[10px] text-white/30 flex items-center gap-1">
              <Shield className="w-2.5 h-2.5" />
              End-to-end encrypted
            </div>
          </div>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
          <X className="w-5 h-5 text-white/40" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <RefreshCw className="w-6 h-6 text-accent animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-40">
            <MessageSquare className="w-12 h-12" />
            <p className="text-xs font-serif italic">Start a safe, anonymous conversation.</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex flex-col max-w-[80%]",
                msg.senderUid === auth.currentUser?.uid ? "ml-auto items-end" : "items-start"
              )}
            >
              <div
                className={cn(
                  "p-3 rounded-2xl text-sm",
                  msg.senderUid === auth.currentUser?.uid
                    ? "bg-accent text-white rounded-tr-none"
                    : "bg-white/10 text-white/90 rounded-tl-none"
                )}
              >
                {msg.content}
              </div>
              <div className="text-[8px] text-white/20 mt-1 uppercase font-mono tracking-widest">
                {msg.createdAt ? new Date(msg.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Sending...'}
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSendMessage} className="p-4 bg-white/5 border-t border-white/5">
        {error && (
          <div className="mb-2 text-[10px] text-red-400 font-medium px-2 py-1 bg-red-400/10 rounded-lg animate-pulse">
            {error}
          </div>
        )}
        <div className="relative">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 pr-12 text-sm focus:outline-none focus:border-accent/50 transition-all"
          />
          <button
            type="submit"
            disabled={!newMessage.trim() || sending}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-accent disabled:opacity-20 transition-opacity"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        <div className="mt-2 text-[8px] text-center text-white/20 uppercase tracking-widest flex items-center justify-center gap-1">
          <Shield className="w-2 h-2" />
          Only text allowed. No links.
        </div>
      </form>
    </motion.div>
  );
}
