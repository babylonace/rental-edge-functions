// Prints a new guest token (256 random bits, URL-safe) and the check-in link that carries it.
// Usage: node scripts/new-token.js [https://guide.example.com/]
// Rotation: move the current GUEST_TOKEN to GUEST_TOKEN_PREV, then save this value as GUEST_TOKEN.
import { randomBytes } from 'node:crypto';

const token = randomBytes(32).toString('base64url');
const base = process.argv[2] || 'https://guide.example.com/';
const link = new URL(base);
link.searchParams.set('k', token);

console.log('GUEST_TOKEN=' + token);
console.log('Check-in link: ' + link.href);
