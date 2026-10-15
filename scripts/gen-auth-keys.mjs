// Generates the RS256 key pair Convex Auth needs and prints JSON.
// Usage: node scripts/gen-auth-keys.mjs | ...   or   npm run auth:keys
import { exportJWK, exportPKCS8, generateKeyPair } from "jose";
const keys = await generateKeyPair("RS256", { extractable: true });
const privateKey = await exportPKCS8(keys.privateKey);
const publicKey = await exportJWK(keys.publicKey);
const jwks = JSON.stringify({ keys: [{ use: "sig", ...publicKey }] });
process.stdout.write(JSON.stringify({ privateKey: privateKey.trimEnd().replace(/\n/g, " "), jwks }));
