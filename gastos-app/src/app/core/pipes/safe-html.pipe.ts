import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/**
 * Confia HTML apenas quando é SVG estático (ícones de nav hardcoded).
 * Qualquer script/on* ou tag não-svg é rejeitado → string vazia segura.
 */
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
    // Apenas tags SVG comuns (sem foreignObject / iframe / embed).
    const stripped = html.replace(/<\/?(svg|path|polyline|line|circle|rect|g|defs|use|title|desc)(\s[^>]*)?>/gi, '');
    return !/<[a-z]/i.test(stripped);
  }
}
