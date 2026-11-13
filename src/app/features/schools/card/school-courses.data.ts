import { Injectable, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Observable, catchError, forkJoin, map, of, throwError } from 'rxjs';
import { ContentApi } from '../../../api/content/content-api';
import { containerFindOne } from '../../../api/content/functions';
import { ContainerResponseDto } from '../../../api/content/models/container-response-dto';
import { ApiError } from '../../../core/auth/api-error';
import { Language } from '../../../core/i18n/languages';
import { LanguageService } from '../../../core/i18n/language.service';
import { ColumnState } from '../schools-list.data';
import { SchoolCardData } from './school-card.data';

/**
 * Courses read per school at most. Content has no batch read, so each course is one request;
 * a school's groups use a handful of courses. Beyond the cap the ids show without titles.
 */
export const MAX_COURSE_READS = 30;

/** What the card shows of a course; the title already in the panel's language when there is one. */
export interface CourseSummary {
  readonly id: string;
  readonly title: string;
  readonly level: string | null;
  readonly archived: boolean;
}

/**
 * Titles per course id. `null` — content does not know the course (404) or hides it (403);
 * an id not in the map was not read (over the cap).
 */
export type CourseTitles = ReadonlyMap<string, CourseSummary | null>;

/**
 * Titles of the courses the school's groups use (organization knows only their ids, §6.1 step 7).
 * A side read of the overview tab: when it fails, the ids stay with a retry (§5, rule 5).
 */
@Injectable()
export class SchoolCoursesData {
  private readonly content = inject(ContentApi);
  private readonly card = inject(SchoolCardData);
  private readonly lang = inject(LanguageService).current;

  /** Course ids of the school and of its groups, in the order organization gives them. */
  readonly ids = computed<readonly string[] | undefined>(() => {
    const school = this.card.school();
    if (!school) return undefined;
    const ids = new Set(school.courses.ids);
    for (const group of school.groups) if (group.courseId) ids.add(group.courseId);
    return [...ids];
  });

  private readonly resource = rxResource({
    params: () => this.ids(),
    stream: ({ params: ids }) => this.read(ids.slice(0, MAX_COURSE_READS)),
  });

  readonly titles = computed<ColumnState<CourseTitles>>(() => {
    if (this.resource.error()) return { kind: 'error' };
    if (!this.resource.hasValue()) return { kind: 'loading' };
    const lang = this.lang();
    const titles = new Map<string, CourseSummary | null>();
    for (const [id, course] of this.resource.value()) {
      titles.set(id, course ? summary(course, lang) : null);
    }
    return { kind: 'ready', value: titles };
  });

  reload(): void {
    this.resource.reload();
  }

  private read(
    ids: readonly string[],
  ): Observable<ReadonlyMap<string, ContainerResponseDto | null>> {
    if (ids.length === 0) return of(new Map());
    return forkJoin(
      ids.map((id) =>
        this.content.invoke(containerFindOne, { id }).pipe(
          map((course): [string, ContainerResponseDto | null] => [id, course]),
          catchError((error: unknown) => {
            // A course gone or hidden is a fact about that course; anything else fails the read.
            const status = ApiError.from(error).status;
            return status === 404 || status === 403
              ? of<[string, null]>([id, null])
              : throwError(() => error);
          }),
        ),
      ),
    ).pipe(map((entries) => new Map(entries)));
  }
}

function summary(course: ContainerResponseDto, lang: Language): CourseSummary {
  const localized = course.localizations?.find((l) => l.languageCode === lang)?.title;
  return {
    id: course.id,
    title: localized || course.title,
    level: course.difficultyLevel ?? null,
    // Typed as an object by the spec (a nullable date): any value means archived or deleted.
    archived: Boolean(course.archivedAt || course.deletedAt),
  };
}
