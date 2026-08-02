import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { PlanningService } from './planning.service';
import { environment } from '../../../environments/environment';
import { Planning } from '../models/api.models';

describe('PlanningService', () => {
  let svc: PlanningService;
  let http: HttpTestingController;
  const base = environment.apiUrl;

  const p1: Planning = { id: 1, name: 'Casa', role: 'owner', memberCount: 2 };
  const p2: Planning = { id: 2, name: 'Viagem', role: 'member', memberCount: 1 };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [PlanningService],
    });
    svc = TestBed.inject(PlanningService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('setActive persists id', () => {
    svc.setActive(5);
    expect(svc.getActiveId()).toBe(5);
    expect(localStorage.getItem('gastos-planning-id')).toBe('5');
  });

  it('clear resets state', () => {
    svc.setActive(1);
    svc.items.set([p1]);
    svc.clear();
    expect(svc.getActiveId()).toBeNull();
    expect(svc.items()).toEqual([]);
  });

  it('load and ensureSelection', () => {
    svc.load().subscribe((items) => expect(items.length).toBe(2));
    http.expectOne(`${base}/plannings`).flush({ items: [p1, p2] });
    expect(svc.activeId()).toBe(1);
    expect(svc.active()?.name).toBe('Casa');
  });

  it('create sets active to new planning', () => {
    svc.create('Novo').subscribe((p) => expect(p.id).toBe(3));
    http.expectOne(`${base}/plannings`).flush({
      item: { id: 3, name: 'Novo', role: 'owner', memberCount: 1 },
    });
    expect(svc.getActiveId()).toBe(3);
  });

  it('update replaces item in list', () => {
    svc.items.set([p1]);
    svc.update(1, 'Casa 2').subscribe();
    http.expectOne(`${base}/plannings/1`).flush({
      item: { id: 1, name: 'Casa 2', role: 'owner', memberCount: 2 },
    });
    expect(svc.items()[0].name).toBe('Casa 2');
  });

  it('delete refreshes list', () => {
    svc.setActive(1);
    svc.delete(1).subscribe((items) => expect(items).toEqual([p2]));
    http.expectOne(`${base}/plannings/1`).flush({ ok: true, items: [p2] });
    expect(svc.getActiveId()).toBe(2);
  });

  it('sendInvite posts email', () => {
    svc.sendInvite(1, 'a@b.com').subscribe((r) => expect(r.email).toBe('a@b.com'));
    const req = http.expectOne(`${base}/plannings/1/invites`);
    expect(req.request.body.email).toBe('a@b.com');
    req.flush({ message: 'ok', email: 'a@b.com' });
  });

  it('getInvite and acceptInvite', () => {
    svc.getInvite('abc').subscribe((inv) => expect(inv.token).toBe('abc'));
    http.expectOne(`${base}/invites/abc`).flush({
      invite: { token: 'abc', planningName: 'Casa', inviterName: 'A', expiresAt: null },
    });

    svc.acceptInvite('abc').subscribe((r) => expect(r.planningId).toBe(1));
    http.expectOne(`${base}/invites/abc`).flush({
      planningId: 1,
      planningName: 'Casa',
      plannings: [p1],
      message: 'ok',
    });
    expect(svc.getActiveId()).toBe(1);
  });

  it('bootstrapFromAuth prefers default id', () => {
    svc.bootstrapFromAuth([p1, p2], 2);
    expect(svc.getActiveId()).toBe(2);
  });

  it('bootstrapFromAuth clears when empty', () => {
    svc.setActive(1);
    svc.bootstrapFromAuth([]);
    expect(svc.getActiveId()).toBeNull();
  });

  it('readStoredId ignores invalid', () => {
    localStorage.setItem('gastos-planning-id', '0');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [PlanningService],
    });
    const s2 = TestBed.inject(PlanningService);
    expect(s2.getActiveId()).toBeNull();
  });
});
