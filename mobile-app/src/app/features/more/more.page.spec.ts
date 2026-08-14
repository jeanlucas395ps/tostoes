import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular/standalone';
import { MorePage } from './more.page';

describe('MorePage', () => {
  let fixture: ComponentFixture<MorePage>;
  let component: MorePage;
  let alertCreate: jasmine.Spy;

  beforeEach(async () => {
    const alertSpy = jasmine.createSpyObj('AlertController', ['create']);
    alertSpy.create.and.resolveTo({ present: async () => {} });
    alertCreate = alertSpy.create;
    const router = jasmine.createSpyObj('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [MorePage, HttpClientTestingModule],
      providers: [
        { provide: AlertController, useValue: alertSpy },
        { provide: Router, useValue: router },
      ],
    })
      .overrideComponent(MorePage, { set: { template: '<div></div>', imports: [] } })
      .compileComponents();
    fixture = TestBed.createComponent(MorePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('starts with the planning manager closed', () => {
    expect(component.showPlanningManager()).toBeFalse();
  });

  it('opens the planning manager', () => {
    component.showPlanningManager.set(true);
    expect(component.showPlanningManager()).toBeTrue();
  });

  it('lists the fixed-items/settings shortcuts', () => {
    expect(component.shortcuts.length).toBe(7);
    const routes = component.shortcuts.map((s) => s.route);
    expect(routes).toContain('/grafo-contas');
    expect(routes).toContain('/relatorios-ia');
    expect(routes).toContain('/gastos-fixos');
    expect(routes).toContain('/compras-parceladas');
    expect(routes).toContain('/recebimentos-fixos');
    expect(routes).toContain('/investimentos-fixos');
    expect(routes).toContain('/configuracoes');
  });

  it('confirms and logs out', async () => {
    await component.confirmLogout();
    const config = alertCreate.calls.mostRecent().args[0];
    expect(config.header).toBe('Sair');
    const destructive = config.buttons.find((b: { role?: string }) => b.role === 'destructive');
    const logoutSpy = spyOn(component.auth, 'logout');
    destructive.handler();
    expect(logoutSpy).toHaveBeenCalled();
  });
});
