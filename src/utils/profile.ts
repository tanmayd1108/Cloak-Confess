const ADJECTIVES = ['Silent', 'Hidden', 'Secret', 'Mystic', 'Quiet', 'Lone', 'Shadow', 'Ghost', 'Dark', 'Bright'];
const NOUNS = ['Whisperer', 'Shadow', 'Ghost', 'Echo', 'Soul', 'Mind', 'Heart', 'Voice', 'Spirit', 'Dreamer'];

export function generateRandomUsername() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 9000) + 1000;
  return `${adj}${noun}${num}`.toLowerCase();
}

export function generateAvatarUrl(username: string) {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;
}
