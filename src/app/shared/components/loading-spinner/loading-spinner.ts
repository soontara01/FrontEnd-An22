import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-loading-spinner',
  imports: [MatProgressSpinnerModule],
  template: `<mat-spinner [diameter]="diameter()" />`,
  styles: `
    :host {
      display: flex;
      justify-content: center;
      padding: 32px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadingSpinner {
  readonly diameter = input(40);
}
