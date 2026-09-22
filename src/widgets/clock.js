/** 時間の表示。 */

import { formatClock, formatClockSeconds, formatDate } from '../time.js';
import { header, inset, stack } from './common.js';
import { asBoolean, asString } from '../validate.js';

export const type = 'clock';

export function normalize(item, path) {
  return {
    label: asString(item.label, `${path}.label`, { fallback: '' }),
    seconds: asBoolean(item.seconds, `${path}.seconds`, false),
    date: asBoolean(item.date, `${path}.date`, true),
  };
}

export function build(options, ctx) {
  return {
    label: options.label,
    time: options.seconds
      ? formatClockSeconds(ctx.now, ctx.timezone)
      : formatClock(ctx.now, ctx.timezone),
    date: options.date ? formatDate(ctx.now, ctx.timezone) : '',
  };
}

export function render(model, box) {
  const head = header(model.label, inset(box));
  return head.svg + stack(head.rest, model.time, model.date);
}
