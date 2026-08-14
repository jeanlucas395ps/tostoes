import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { TabsPage } from './tabs.page';

describe('TabsPage', () => {
  let fixture: ComponentFixture<TabsPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TabsPage, RouterModule.forRoot([])],
    }).compileComponents();
    fixture = TestBed.createComponent(TabsPage);
  });

  it('creates', () => {
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });
});
