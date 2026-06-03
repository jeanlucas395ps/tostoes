import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Planning, PlanningInvitePreview } from '../models/api.models';

const PLANNING_KEY = 'gastos-planning-id';

@Injectable({ providedIn: 'root' })
export class PlanningService {
  private http = inject(HttpClient);

  readonly items = signal<Planning[]>([]);
  readonly activeId = signal<number | null>(this.readStoredId());
  readonly active = computed(() => {
    const id = this.activeId();
    return this.items().find((p) => p.id === id) ?? null;
  });

  private get base(): string {
    return environment.apiUrl;
  }

  getActiveId(): number | null {
    return this.activeId();
  }

  setActive(id: number): void {
    localStorage.setItem(PLANNING_KEY, String(id));
    this.activeId.set(id);
  }

  clear(): void {
    localStorage.removeItem(PLANNING_KEY);
    this.activeId.set(null);
    this.items.set([]);
  }

  load(): Observable<Planning[]> {
    return this.http.get<{ items: Planning[] }>(`${this.base}/plannings`).pipe(
      tap((res) => {
        this.items.set(res.items);
        this.ensureSelection(res.items);
      }),
      map((res) => res.items)
    );
  }

  create(name: string): Observable<Planning> {
    return this.http.post<{ item: Planning }>(`${this.base}/plannings`, { name }).pipe(
      tap((res) => {
        this.items.update((list) => [...list, res.item]);
        this.setActive(res.item.id);
      }),
      map((res) => res.item)
    );
  }

  sendInvite(
    planningId: number,
    email: string
  ): Observable<{ message: string; email: string; planningName?: string; inviteUrl?: string }> {
    return this.http.post<{ message: string; email: string; planningName?: string; inviteUrl?: string }>(
      `${this.base}/plannings/${planningId}/invites`,
      { email, planningId }
    );
  }

  getInvite(token: string): Observable<PlanningInvitePreview> {
    return this.http
      .get<{ invite: PlanningInvitePreview }>(`${this.base}/invites/${token}`)
      .pipe(map((r) => r.invite));
  }

  acceptInvite(token: string): Observable<{
    planningId: number;
    planningName: string;
    plannings: Planning[];
    message: string;
  }> {
    return this.http
      .post<{
        planningId: number;
        planningName: string;
        plannings: Planning[];
        message: string;
      }>(`${this.base}/invites/${token}/accept`, {})
      .pipe(
        tap((res) => {
          this.items.set(res.plannings);
          this.setActive(res.planningId);
        })
      );
  }

  bootstrapFromAuth(plannings: Planning[], preferredId?: number): void {
    this.items.set(plannings);
    if (preferredId && plannings.some((p) => p.id === preferredId)) {
      this.setActive(preferredId);
      return;
    }
    this.ensureSelection(plannings);
  }

  private ensureSelection(plannings: Planning[]): void {
    if (!plannings.length) {
      this.activeId.set(null);
      localStorage.removeItem(PLANNING_KEY);
      return;
    }
    const stored = this.readStoredId();
    if (stored && plannings.some((p) => p.id === stored)) {
      this.activeId.set(stored);
      return;
    }
    this.setActive(plannings[0].id);
  }

  private readStoredId(): number | null {
    const raw = localStorage.getItem(PLANNING_KEY);
    if (!raw) return null;
    const id = parseInt(raw, 10);
    return id > 0 ? id : null;
  }
}
