import { Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Tag } from 'primeng/tag';
import { AdminUserListItem } from '../../core/auth/admin-users.api';
import { userBadges } from './user-status';

/** The status badges of an account (`userBadges`); nothing at all, or "active" when `showActive`. */
@Component({
  selector: 'app-user-badges',
  imports: [Tag, TranslocoPipe],
  template: `
    <span class="inline-flex flex-wrap gap-1" data-testid="user-badges">
      @for (badge of badges(); track badge.kind) {
        <p-tag
          [severity]="badge.severity"
          [attr.data-badge]="badge.kind"
          [value]="
            badge.kind === 'deletion' && badge.days !== undefined
              ? badge.days === 0
                ? ('users.badge.deletionDue' | transloco)
                : ('users.badge.deletion' | transloco: { n: badge.days })
              : ('users.badge.' + badge.kind | transloco)
          "
        />
      } @empty {
        @if (showActive()) {
          <p-tag
            severity="success"
            data-badge="active"
            [value]="'users.badge.active' | transloco"
          />
        }
      }
    </span>
  `,
})
export class UserBadges {
  readonly user =
    input.required<
      Pick<
        AdminUserListItem,
        'blockedAt' | 'lockedUntil' | 'deletionRequestedAt' | 'purgeAt' | 'emailVerified'
      >
    >();
  readonly showActive = input(true);
  protected readonly badges = computed(() => userBadges(this.user()));
}
