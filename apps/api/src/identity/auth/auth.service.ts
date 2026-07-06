import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

/** Password hashing helpers - the base for the upcoming auth endpoints. */
@Injectable()
export class AuthService {
  hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, SALT_ROUNDS);
  }

  verifyPassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  generateOtp(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }
}
