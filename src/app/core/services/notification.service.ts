import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly snackBar = inject(MatSnackBar);

  success(message: string): void {
    this.open(message, 'snack-success');
  }

  error(message: string): void {
    this.open(message, 'snack-error', 5000);
  }

  info(message: string): void {
    this.open(message, 'snack-info');
  }

  private open(message: string, panelClass: string, duration = 3000): void {
    this.snackBar.open(message, 'ปิด', { duration, panelClass, horizontalPosition: 'end' });
  }
}
