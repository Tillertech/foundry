import { Injectable, inject, signal } from '@angular/core';
import { SecureStorageService } from '../../core/storage/secure-storage.service';

const TOKEN_KEY = 'foundry.token.v2';
/** Pre-encryption keys; purged on restore so no plaintext session survives. */
const LEGACY_KEYS = ['foundry.token.v1', 'ledger.auth.v1', 'ledger.store.v1'];

/**
 * Holds the JWT used by the auth interceptor. Persisted AES-GCM-encrypted;
 * the signal starts empty and is hydrated by the app initializer before
 * the router (and its guards) runs.
 */
@Injectable({ providedIn: 'root' })
export class ApiTokenStore {
  private readonly storage = inject(SecureStorageService);

  readonly token = signal<string | null>(null);

  set(token: string): void {
    this.token.set(token);
    void this.storage.setItem(TOKEN_KEY, token);
  }

  clear(): void {
    this.token.set(null);
    this.storage.removeItem(TOKEN_KEY);
  }

  async restore(): Promise<void> {
    for (const key of LEGACY_KEYS) this.storage.removeItem(key);
    const token = await this.storage.getItem(TOKEN_KEY);
    if (token) this.token.set(token);
  }
}
