import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AlertController, ToastController } from '@ionic/angular/standalone';
import { PlanningManagerComponent } from './planning-manager.component';
import { PlanningService } from '../../../core/services/planning.service';
import { StorageService } from '../../../core/services/storage.service';
import { environment } from '../../../../environments/environment';
import { Planning } from '../../../core/models/api.models';

describe('PlanningManagerComponent', () => {
  let fixture: ComponentFixture<PlanningManagerComponent>;
  let component: PlanningManagerComponent;
  let http: HttpTestingController;
  let alertCreate: jasmine.Spy;
  const base = environment.apiUrl;

  const owned: Planning = { id: 1, name: 'Casa', role: 'owner', memberCount: 2 };
  const member: Planning = { id: 2, name: 'Viagem', role: 'member', memberCount: 3 };

  beforeEach(async () => {
    const storage = jasmine.createSpyObj('StorageService', ['get', 'set', 'remove']);
    storage.get.and.returnValue(null);
    const alertSpy = jasmine.createSpyObj('AlertController', ['create']);
    alertSpy.create.and.resolveTo({ present: async () => {} });
    alertCreate = alertSpy.create;
    const toastSpy = jasmine.createSpyObj('ToastController', ['create']);
    toastSpy.create.and.resolveTo({ present: async () => {} });

    await TestBed.configureTestingModule({
      imports: [PlanningManagerComponent, HttpClientTestingModule],
      providers: [
        { provide: StorageService, useValue: storage },
        { provide: AlertController, useValue: alertSpy },
        { provide: ToastController, useValue: toastSpy },
      ],
    })
      .overrideComponent(PlanningManagerComponent, { set: { template: '<div></div>', imports: [] } })
      .compileComponents();
    fixture = TestBed.createComponent(PlanningManagerComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    component.planning.items.set([owned, member]);
    component.planning.setActive(1);
  });

  afterEach(() => http.verify());

  it('emits cancelled when selecting the already-active planning', () => {
    let cancelled = false;
    component.cancelled.subscribe(() => (cancelled = true));
    const reload = spyOn<any>(component, 'reload');
    component.select(1);
    expect(cancelled).toBeTrue();
    expect(reload).not.toHaveBeenCalled();
  });

  it('switches the active planning and reloads when selecting a different one', () => {
    const reload = spyOn<any>(component, 'reload');
    component.select(2);
    expect(component.planning.getActiveId()).toBe(2);
    expect(reload).toHaveBeenCalled();
  });

  it('requires a name before creating', () => {
    component.openCreate();
    component.nameInput.set('   ');
    component.submitCreate();
    expect(component.error()).toContain('nome');
  });

  it('creates a planning and reloads on success', () => {
    const reload = spyOn<any>(component, 'reload');
    component.openCreate();
    component.nameInput.set('Trabalho');
    component.submitCreate();
    http.expectOne(`${base}/plannings`).flush({ item: { id: 3, name: 'Trabalho', role: 'owner', memberCount: 1 } });
    expect(reload).toHaveBeenCalled();
  });

  it('prefills the rename form with the planning name and returns to the list on success', () => {
    component.openRename(owned);
    expect(component.nameInput()).toBe('Casa');
    component.nameInput.set('Casa Nova');
    component.submitRename();
    http.expectOne(`${base}/plannings/1`).flush({ item: { ...owned, name: 'Casa Nova' } });
    expect(component.mode()).toBe('list');
  });

  it('validates the invite form before sending', () => {
    component.openInvite();
    component.invitePlanningId.set(null);
    component.submitInvite();
    expect(component.error()).toContain('planejamento');

    component.invitePlanningId.set(1);
    component.inviteEmail.set('');
    component.submitInvite();
    expect(component.error()).toContain('e-mail');
  });

  it('shows the dev invite link appended to the success message', () => {
    component.openInvite();
    component.invitePlanningId.set(1);
    component.inviteEmail.set('a@b.com');
    component.submitInvite();
    http
      .expectOne(`${base}/plannings/1/invites`)
      .flush({ message: 'Convite enviado.', email: 'a@b.com', inviteUrl: 'http://x/convite/tok' });
    expect(component.successMessage()).toBe('Convite enviado. Link (dev): http://x/convite/tok');
  });

  it('deletes the planning after confirming and opens create when none remain', async () => {
    await component.confirmDelete(owned);
    const config = alertCreate.calls.mostRecent().args[0];
    const destructive = config.buttons.find((b: { role?: string }) => b.role === 'destructive');
    destructive.handler();
    http.expectOne(`${base}/plannings/1`).flush({ ok: true, items: [] });
    expect(component.mode()).toBe('create');
  });
});
