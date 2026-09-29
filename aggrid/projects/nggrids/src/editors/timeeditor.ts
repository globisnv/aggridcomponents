import { Component, ChangeDetectionStrategy, Inject, DOCUMENT, Renderer2 } from '@angular/core';
import { EditorDirective } from './editor';
import { FormattingService, MaskFormat } from '@servoy/public';
import { createTimeMaskFormat, parseMaskedTime, toHHmm } from '../time-minutes';

@Component({
    selector: 'aggrid-timeeditor',
    template: `
    <div class="ag-input-wrapper">
      <input class="ag-cell-edit-input" inputmode="numeric" #element>
    </div>
    `,
    host: {
        'style': 'width: 100%; height: 100%;'
    },
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class TimeEditor extends EditorDirective {

    private mask: MaskFormat;

    constructor(private renderer: Renderer2, private formattingService: FormattingService, @Inject(DOCUMENT) private doc: Document) {
        super();
    }

    ngAfterViewInit(): void {
        const input = this.elementRef().nativeElement as HTMLInputElement;
        input.value = toHHmm(this.initialValue) ?? '';
        if (!this.ngGrid.isInFindMode()) {
            this.mask = new MaskFormat(createTimeMaskFormat(), this.renderer, input, this.formattingService, this.doc);
        }
        setTimeout(() => {
            input.focus();
            input.select();
        }, 0);
    }

    ngOnDestroy() {
        this.mask?.destroy();
    }

    isPopup(): boolean {
        return false;
    }

    // an invalid entry keeps the cell's value
    getValue(): number | string {
        const text = (this.elementRef().nativeElement as HTMLInputElement).value;
        if (this.ngGrid.isInFindMode()) {
            return text;
        }
        const minutes = parseMaskedTime(text);
        return Number.isNaN(minutes) ? this.initialValue : minutes;
    }
}
