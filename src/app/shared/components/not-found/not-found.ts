import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { EmptyState } from '../empty-state/empty-state';

@Component({
  selector: 'app-not-found',
  imports: [EmptyState, MatButtonModule],
  template: `
    <app-empty-state icon="search_off" message="404 - ไม่พบหน้าที่ต้องการ">
      <a mat-flat-button href="/">กลับหน้าแรก</a>
    </app-empty-state>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class NotFound {}
