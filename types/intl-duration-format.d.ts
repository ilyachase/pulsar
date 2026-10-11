// Intl.DurationFormat ships in Chrome 129+ and Node 23+, but TypeScript 5.9's lib has no types yet.
declare namespace Intl {
  interface DurationLike {
    years?: number;
    months?: number;
    weeks?: number;
    days?: number;
    hours?: number;
    minutes?: number;
    seconds?: number;
    milliseconds?: number;
  }
  interface DurationFormatOptions {
    style?: 'long' | 'short' | 'narrow' | 'digital';
  }
  class DurationFormat {
    constructor(locales?: string | string[], options?: DurationFormatOptions);
    format(duration: DurationLike): string;
  }
}
