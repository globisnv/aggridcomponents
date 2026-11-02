import { describe, it, expect } from 'vitest';
import { getPopupBodyMaxHeight } from './popupheight';

function element(top: number, bottom: number, parent?: HTMLElement): HTMLElement {
    const div = document.createElement('div');
    div.getBoundingClientRect = () => ({ top, bottom }) as DOMRect;
    parent?.appendChild(div);
    return div;
}

describe('getPopupBodyMaxHeight (GLR-7459)', () => {
    it('leaves room for the Apply panel below the conditions', () => {
        const popup = element(300, 1000);
        const body = element(300, 960, popup);

        // the window, minus the top of the conditions, the Apply panel of 40 and the margin of the popup
        expect(getPopupBodyMaxHeight(body)).toBe(window.innerHeight - 300 - 40 - 8);
    });

    it('keeps a minimum height when the popup opens low in the window', () => {
        const popup = element(window.innerHeight - 50, window.innerHeight + 300);
        const body = element(window.innerHeight - 50, window.innerHeight + 260, popup);

        expect(getPopupBodyMaxHeight(body)).toBe(120);
    });
});
