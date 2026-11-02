// room the AG Grid popup keeps around its content
const POPUP_MARGIN = 8;
// the conditions keep at least this height, also when the popup opens low in the window
const MIN_HEIGHT = 120;

/**
 * [GLR-7459] The height the conditions of a filter popup can take, so the popup and its Apply / Clear buttons below
 * them stay within the window; the conditions scroll when they need more. The body is the element with the
 * conditions, followed by the Apply panel in the same parent.
 */
export function getPopupBodyMaxHeight(body: HTMLElement): number {
    const bodyRect = body.getBoundingClientRect();
    const below = body.parentElement!.getBoundingClientRect().bottom - bodyRect.bottom;
    return Math.max(MIN_HEIGHT, Math.floor(body.ownerDocument.defaultView!.innerHeight - bodyRect.top - below - POPUP_MARGIN));
}
