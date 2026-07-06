import { Injectable } from '@angular/core';

const DB_NAME = 'foundry.keystore';
const DB_STORE = 'keys';
const KEY_ID = 'session-key.v1';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function openKeystore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function keystoreGet(db: IDBDatabase): Promise<CryptoKey | undefined> {
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(DB_STORE, 'readonly')
      .objectStore(DB_STORE)
      .get(KEY_ID);
    req.onsuccess = () => resolve(req.result as CryptoKey | undefined);
    req.onerror = () => reject(req.error);
  });
}

function keystorePut(db: IDBDatabase, key: CryptoKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(DB_STORE, 'readwrite')
      .objectStore(DB_STORE)
      .put(key, KEY_ID);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * AES-GCM-encrypted localStorage values. The 256-bit key is generated
 * non-extractable and lives only in this origin's IndexedDB, so the
 * ciphertext in localStorage cannot be read (or exported) directly.
 * Values that fail to decrypt (tampered, or the keystore was cleared)
 * are dropped as if absent. No-ops on the server, where none of the
 * browser storage APIs exist.
 */
@Injectable({ providedIn: 'root' })
export class SecureStorageService {
  private keyPromise: Promise<CryptoKey> | null = null;

  private get available(): boolean {
    return (
      typeof localStorage !== 'undefined' &&
      typeof indexedDB !== 'undefined' &&
      typeof crypto !== 'undefined' &&
      !!crypto.subtle
    );
  }

  async setItem(name: string, value: string): Promise<void> {
    if (!this.available) return;
    try {
      const key = await this.key();
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const cipher = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(value),
      );
      localStorage.setItem(
        name,
        `${toBase64(iv)}.${toBase64(new Uint8Array(cipher))}`,
      );
    } catch {
      // A failed write must not take the app down; the value stays in-memory.
    }
  }

  async getItem(name: string): Promise<string | null> {
    if (!this.available) return null;
    const raw = localStorage.getItem(name);
    if (!raw) return null;
    const [iv, data] = raw.split('.');
    if (!iv || !data) {
      localStorage.removeItem(name);
      return null;
    }
    try {
      const key = await this.key();
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromBase64(iv) },
        key,
        fromBase64(data),
      );
      return new TextDecoder().decode(plain);
    } catch {
      localStorage.removeItem(name);
      return null;
    }
  }

  removeItem(name: string): void {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(name);
  }

  private key(): Promise<CryptoKey> {
    this.keyPromise ??= this.loadOrCreateKey();
    return this.keyPromise;
  }

  private async loadOrCreateKey(): Promise<CryptoKey> {
    const db = await openKeystore();
    try {
      const existing = await keystoreGet(db);
      if (existing) return existing;
      const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false, // non-extractable: the key material can never leave the keystore
        ['encrypt', 'decrypt'],
      );
      await keystorePut(db, key);
      return key;
    } finally {
      db.close();
    }
  }
}
