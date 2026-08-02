import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { AlertController } from '@ionic/angular/standalone';
import { MorePage } from './more.page';

describe('MorePage', () => {
  let fixture: ComponentFixture<MorePage>;
  let component: MorePage;

  beforeEach(async () => {
    const alertSpy = jasmine.createSpyObj('AlertController', ['create']);
    alertSpy.create.and.resolveTo({ present: async () => {} });

    await TestBed.configureTestingModule({
      imports: [MorePage, HttpClientTestingModule],
      providers: [{ provide: AlertController, useValue: alertSpy }],
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

  it('lists the six fixed-items/settings shortcuts', () => {
    expect(component.shortcuts.length).toBe(6);
    expect(component.shortcuts.map((s) => s.route)).toContain('/grafo-contas');
  });
});
