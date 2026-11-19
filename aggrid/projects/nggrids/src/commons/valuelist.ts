import { EMPTY, MonoTypeOperatorFunction } from 'rxjs';
import { catchError } from 'rxjs/operators';

/**
 * Ends a valuelist request quietly when Servoy rejects it.
 *
 * Servoy keeps only the newest filterList request of a valuelist: a second call before the client sends leaves the
 * first one unanswered. When the valuelist is destroyed (form closed, user switched) Servoy rejects every unanswered
 * request with the string "<id> cancelled!". Subscribed without an error callback, RxJS throws that string as an
 * uncaught error (COM-981). Nobody waits for such an answer any more, so the request just completes without a value.
 */
export function ignoreValuelistRequestError<T>(): MonoTypeOperatorFunction<T> {
    return catchError(() => EMPTY);
}
