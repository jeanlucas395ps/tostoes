import { TestBed } from '@angular/core/testing';
import { DomSanitizer } from '@angular/platform-browser';
import { SafeHtmlPipe } from './safe-html.pipe';

describe('SafeHtmlPipe', () => {
  it('bypasses sanitization for html', () => {
    TestBed.configureTestingModule({ providers: [SafeHtmlPipe] });
    const pipe = TestBed.inject(SafeHtmlPipe);
    const sanitizer = TestBed.inject(DomSanitizer);
    const html = '<b>ok</b>';
    const spy = spyOn(sanitizer, 'bypassSecurityTrustHtml').and.callThrough();
    const result = pipe.transform(html);
    expect(spy).toHaveBeenCalledWith(html);
    expect(result).toBeTruthy();
  });
});
