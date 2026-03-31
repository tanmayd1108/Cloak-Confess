export type ConfessionStatus = 'published' | 'flagged' | 'hidden';

export type ReactionType = 'relatable' | 'dead' | 'shocking' | 'love';

export type ConfessionTheme = 'default' | 'sad' | 'aesthetic' | 'neon' | 'dark' | 'love';

export type ConfessionMood = 'sad' | 'love' | 'drama' | 'funny' | 'angry' | 'scary';

export interface Confession {
  id: string;
  content: string;
  category: string;
  mood: ConfessionMood;
  tags: string[];
  status: ConfessionStatus;
  reportsCount: number;
  reactions: Record<ReactionType, number>;
  commentsCount: number;
  viewsCount: number;
  score: number;
  createdAt: any; // Firestore Timestamp
  anonymousId: string;
  authorUid: string;
  persona?: string;
  isPrivate?: boolean;
  invitedEmails?: string[];
  invitedUsernames?: string[];
  community?: {
    type: 'College' | 'City' | 'Workplace' | 'General';
    name: string;
  };
  audioUrl?: string;
  theme?: ConfessionTheme;
  poll?: {
    question: string;
    options: { text: string; votes: number }[];
    voters: string[];
  };
}

export interface PrivateMessage {
  id: string;
  confessionId: string;
  senderUid: string;
  receiverUid: string;
  content: string;
  createdAt: any;
}

export interface DailyPrompt {
  id: string;
  question: string;
  date: string; // YYYY-MM-DD
}

export interface Comment {
  id: string;
  confessionId: string;
  parentCommentId?: string | null;
  content: string;
  authorUid: string;
  authorUsername?: string;
  anonymousId: string;
  persona?: string;
  createdAt: any;
}

export interface Report {
  id: string;
  confessionId: string;
  reason: string;
  createdAt: any;
}

export interface UserProfile {
  uid: string;
  role: 'admin' | 'user';
  email?: string | null;
  username: string;
  username_lower: string;
  avatarUrl: string;
  bio?: string;
  isPublic: boolean;
  streakCount: number;
  lastConfessionDate?: any; // Firestore Timestamp
  badges?: string[];
  stats?: {
    totalPosts: number;
    totalLikes: number;
    totalViews: number;
    totalRelatable: number;
    topConfessionId?: string;
  };
  createdAt: any;
  displayName?: string | null;
  photoURL?: string | null;
  lastActive?: any;
  updatedAt?: any;
}

export interface SavedConfession {
  id: string;
  confessionId: string;
  uid: string;
  savedAt: any;
}
