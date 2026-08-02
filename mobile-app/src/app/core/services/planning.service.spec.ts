import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { PlanningService } from './planning.service';
import { StorageService, STORAGE_KEYS } from './storage.service';
import { environment } from '../../../environments/environment';
import { Planning } from '../models/api.models';

describe('PlanningService', () => {
  let svc: PlanningService;
  let http: HttpTestingController;
  let storage: jasmine.SpyObj<StorageService>;
  const base = environment.apiUrl;
  const p1: Planning = { id: 1, name: 'Casa', role: 'owner', memberCount: 1 };
  const p2: Planning = { id: 2, name: 'Viagem', role: 'member', memberCount: 1 };

  beforeEach(() => {
    storage = jasmine.createSpyObj('StorageService', ['get', 'set', 'remove']);
    storage.get.and.returnValue(null);
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [PlanningService, { provide: StorageService, useValue: storage }],
    });
    svc = TestBed.inject(PlanningService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('setActive clear load create', () => {
    svc.setActive(5);
    expect(storage.set).toHaveBeenCalledWith(STORAGE_KEYS.planningId, '5');
    svc.clear();
    expect(svc.getActiveId()).toBeNull();

    svc.load().subscribe((items) => expect(items.length).toBe(2));
    http.expectOne(`${base}/plannings`).flush({ items: [p1, p2] });
    expect(svc.activeId()).toBe(1);

    svc.create('Novo').subscribe();
    http.expectOne(`${base}/plannings`).flush({
      item: { id: 3, name: 'Novo', role: 'owner', memberCount: 1 },
    });
  });

  it('update delete invite bootstrap', () => {
    svc.items.set([p1]);
    svc.update(1, 'Casa 2').subscribe();
    http.expectOne(`${base}/plannings/1`).flush({
      item: { ...p1, name: 'Casa 2' },
    });

    svc.delete(1).subscribe();
    http.expectOne(`${base}/plannings/1`).flush({ ok: true, items: [p2] });

    svc.sendInvite(1, 'a@b.com').subscribe();
    http.expectOne(`${base}/plannings/1/invites`).flush({ message: 'ok', email: 'a@b.com' });

    svc.getInvite('tok').subscribe((i) => expect(i.token).toBe('tok'));
    http.expectOne(`${base}/invites/tok`).flush({
      invite: { token: 'tok', planningName: 'Casa', inviterName: 'A', expiresAt: null },
    });

    svc.acceptInvite('tok').subscribe();
    http.expectOne(`${base}/invites/tok`).flush({
      planningId: 1,
      planningName: 'Casa',
      plannings: [p1],
      message: 'ok',
    });

    svc.bootstrapFromAuth([p1, p2], 2);
    expect(svc.getActiveId()).toBe(2);
    svc.bootstrapFromAuth([]);
    expect(svc.getActiveId()).toBeNull();
  });
});
