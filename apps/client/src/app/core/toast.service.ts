import { Injectable } from '@angular/core';
import { toast } from 'ngx-sonner';

/** Central wrapper around ngx-sonner so pages never import the lib directly. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  success(message: string, description?: string): void {
    console.log('success');
    toast.success(message, { description });
  }

  error(message: string, description?: string): void {
    toast.error(message, { description });
  }

  info(message: string, description?: string): void {
    toast.info(message, { description });
  }

  created(entity: string): void {
    this.success(`${entity} created`);
  }

  updated(entity: string): void {
    this.success(`${entity} updated`);
  }

  deleted(entity: string): void {
    this.success(`${entity} deleted`);
  }
}
