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

  it('allows static svg', () => {
    const spy = spyOn(sanitizer, 'bypassSecurityTrustHtml').and.callThrough();
    const svg = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>';
    pipe.transform(svg);
    expect(spy).toHaveBeenCalledWith(svg);
  });

  it('blocks xss payloads', () => {
    const spy = spyOn(sanitizer, 'bypassSecurityTrustHtml').and.callThrough();
    pipe.transform('<b onclick="alert(1)">x</b>');
    expect(spy).toHaveBeenCalledWith('');
  });
});
