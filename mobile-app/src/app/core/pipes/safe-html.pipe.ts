import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/** Mesma política do web: só SVG estático sem handlers. */
@Pipe({
  name: 'safeHtml',
  standalone: true,
})
export class SafeHtmlPipe implements PipeTransform {
  private sanitizer = inject(DomSanitizer);

  transform(value: string): SafeHtml {
    const html = (value ?? '').trim();
    if (!this.isSafeSvg(html)) {
      return this.sanitizer.bypassSecurityTrustHtml('');
    }
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  private isSafeSvg(html: string): boolean {
    if (!html.startsWith('<svg') || !html.endsWith('</svg>')) {
      return false;
    }
    if (/<script|javascript:|on\w+\s*=/i.test(html)) {
      return false;
    }
    const stripped = html.replace(/<\/?(svg|path|polyline|line|circle|rect|g|defs|use|title|desc)(\s[^>]*)?>/gi, '');
    return !/<[a-z]/i.test(stripped);
  }
}
