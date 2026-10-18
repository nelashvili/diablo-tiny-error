/**
 * <OpeningCrawl>: a movie-style story crawl. A blue opening line, then the title and three
 * paragraphs rolling away into the stars. Any tap, click or key skips it; it also ends on its own.
 * `story` picks the text: `story.<story>.intro|episode|title|p1|p2|p3` (the new-hero intro is
 * `crawl`, the end of Act I is `act1End`).
 */
import { useEffect, useRef } from 'preact/hooks';
import type { JSX } from 'preact';
import { t } from '../../data/names';
import './crawl.css';

/** Intro line + crawl, in seconds (matches crawl.css). */
export const CRAWL_SEC = 4 + 30;

export function OpeningCrawl({
  onDone,
  story = 'crawl',
}: {
  onDone: () => void;
  story?: string;
}): JSX.Element {
  const k = (part: string) => t(`story.${story}.${part}`);
  const done = useRef(false);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone();
  };

  useEffect(() => {
    const timer = setTimeout(finish, CRAWL_SEC * 1000);
    const onKey = () => finish();
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div class="crawl" role="dialog" aria-label={k('title')} onPointerDown={finish}>
      <div class="crawl-stars" />
      <p class="crawl-intro">{k('intro')}</p>
      <div class="crawl-stage">
        <div class="crawl-text">
          <p class="crawl-episode">{k('episode')}</p>
          <h1 class="crawl-title">{k('title')}</h1>
          <p>{k('p1')}</p>
          <p>{k('p2')}</p>
          <p>{k('p3')}</p>
        </div>
      </div>
      <p class="crawl-skip">{t('story.crawl.skip')}</p>
    </div>
  );
}
