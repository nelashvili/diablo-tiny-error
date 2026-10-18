/**
 * <OpeningCrawl>: the movie-style story intro shown once when a new hero starts. A blue
 * "long time ago" line, then the title and three paragraphs rolling away into the stars.
 * Any tap, click or key skips it; it also ends on its own.
 */
import { useEffect, useRef } from 'preact/hooks';
import type { JSX } from 'preact';
import { t } from '../../data/names';
import './crawl.css';

/** Intro line + crawl, in seconds (matches crawl.css). */
export const CRAWL_SEC = 4 + 30;

export function OpeningCrawl({ onDone }: { onDone: () => void }): JSX.Element {
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
    <div class="crawl" role="dialog" aria-label={t('story.crawl.title')} onPointerDown={finish}>
      <div class="crawl-stars" />
      <p class="crawl-intro">{t('story.crawl.intro')}</p>
      <div class="crawl-stage">
        <div class="crawl-text">
          <p class="crawl-episode">{t('story.crawl.episode')}</p>
          <h1 class="crawl-title">{t('story.crawl.title')}</h1>
          <p>{t('story.crawl.p1')}</p>
          <p>{t('story.crawl.p2')}</p>
          <p>{t('story.crawl.p3')}</p>
        </div>
      </div>
      <p class="crawl-skip">{t('story.crawl.skip')}</p>
    </div>
  );
}
