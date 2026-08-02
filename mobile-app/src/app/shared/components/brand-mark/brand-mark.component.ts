import { Component, input } from '@angular/core';

/** Marca Tostoes,  mesmo ícone de cifrão do frontend web. */
@Component({
  selector: 'app-brand-mark',
  standalone: true,
  template: `
    <div class="brand-mark" [class.brand-mark--light]="variant() === 'light'" [attr.aria-hidden]="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 0 1 0 4H8"/>
        <path d="M12 6v2"/>
        <path d="M12 16v2"/>
      </svg>
    </div>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }
      .brand-mark {
        width: 56px;
        height: 56px;
        border-radius: var(--radius-xl, 16px);
        background: var(--gradient-brand, linear-gradient(135deg, #4527a0 0%, #6b4ee6 100%));
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        box-shadow: var(--brand-glow, 0 4px 14px rgba(217, 119, 6, 0.35));
      }
      .brand-mark--light {
        background: rgba(255, 255, 255, 0.14);
        border: 1px solid rgba(255, 255, 255, 0.28);
        box-shadow: none;
        backdrop-filter: blur(6px);
      }
      svg {
        width: 28px;
        height: 28px;
      }
    `,
  ],
})
export class BrandMarkComponent {
  /** `light` = glass no hero escuro; default = gradient brand. */
  variant = input<'default' | 'light'>('light');
}
