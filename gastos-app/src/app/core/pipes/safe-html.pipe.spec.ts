import { TestBed } from '@angular/core/testing';
import { DomSanitizer } from '@angular/platform-browser';
import { SafeHtmlPipe } from './safe-html.pipe';

describe('SafeHtmlPipe', () => {
  let pipe: SafeHtmlPipe;
  let sanitizer: DomSanitizer;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [SafeHtmlPipe] });
    pipe = TestBed.inject(SafeHtmlPipe);
    sanitizer = TestBed.inject(DomSanitizer);
  });

  it('allows static svg icons', () => {
    const spy = spyOn(sanitizer, 'bypassSecurityTrustHtml').and.callThrough();
    const svg =
      '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7"/></svg>';
    pipe.transform(svg);
    expect(spy).toHaveBeenCalledWith(svg);
  });

  it('rejects script and event handlers', () => {
    const spy = spyOn(sanitizer, 'bypassSecurityTrustHtml').and.callThrough();
    pipe.transform('<svg onload="alert(1)"></svg>');
    expect(spy).toHaveBeenCalledWith('');
    pipe.transform('<script>alert(1)</script>');
    expect(spy).toHaveBeenCalledWith('');
  });

  it('rejects nullish and foreignObject svg', () => {
    const spy = spyOn(sanitizer, 'bypassSecurityTrustHtml').and.callThrough();
    pipe.transform(null as unknown as string);
    expect(spy).toHaveBeenCalledWith('');
    pipe.transform('<svg><foreignObject></foreignObject></svg>');
    expect(spy).toHaveBeenCalledWith('');
  });
});
