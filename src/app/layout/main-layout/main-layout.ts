import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '@core/auth/auth.service';
import { MENU } from '@core/navigation/menu.config';
import { LoadingService } from '@core/services/loading.service';
import { ThemeService } from '@core/services/theme.service';

/** Below this width the side menu overlays the content (phones + portrait tablets). */
const COMPACT_QUERY = '(max-width: 959.98px)';

/** First URL segment, e.g. '/users/1/edit?x=1' → 'users'. */
const firstSegment = (url: string): string => url.split(/[/?#]/).filter(Boolean)[0] ?? '';

/**
 * Shell for logged-in pages: toolbar + side menu (from MENU) + routed feature.
 * Menu links are plain `href` (full page reload = "SPA per menu");
 * navigation inside a feature uses routerLink (no reload).
 */
@Component({
  selector: 'app-main-layout',
  imports: [
    RouterOutlet,
    MatToolbarModule,
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatProgressBarModule,
    MatTooltipModule,
  ],
  templateUrl: './main-layout.html',
  styleUrl: './main-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainLayout {
  protected readonly auth = inject(AuthService);
  protected readonly loading = inject(LoadingService);
  protected readonly theme = inject(ThemeService);
  protected readonly menu = MENU;

  private readonly router = inject(Router);
  protected readonly activeMenu = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => firstSegment(e.urlAfterRedirects)),
    ),
    { initialValue: firstSegment(this.router.url) },
  );

  private readonly breakpoints = inject(BreakpointObserver);

  /** Phone / portrait tablet: menu overlays content instead of pushing it. */
  protected readonly isCompact = toSignal(
    this.breakpoints.observe(COMPACT_QUERY).pipe(map((result) => result.matches)),
    { initialValue: this.breakpoints.isMatched(COMPACT_QUERY) },
  );

  /** The menu always starts hidden on every page load; ☰ shows it. */
  protected readonly menuOpen = signal(false);

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  /** Keeps state in sync when the overlay is closed by backdrop click / Esc. */
  protected onOpenedChange(open: boolean): void {
    this.menuOpen.set(open);
  }
}
