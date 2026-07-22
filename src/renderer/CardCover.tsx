import type { PageCover } from '../domain/document';

export function CardCover({ cover }: { cover: PageCover }) {
  const titleSize = cover.title.length > 42 ? 'cover-title-xlong' : cover.title.length > 26 ? 'cover-title-long' : '';
  return (
    <section class={`card-cover cover-${cover.mode} ${titleSize}`}>
      <div class="card-cover-decoration" aria-hidden="true" />
      {cover.kicker && <p class="card-cover-kicker">{cover.kicker}</p>}
      <h1 class="card-cover-title">{cover.title}</h1>
      {cover.subtitle && <p class="card-cover-subtitle">{cover.subtitle}</p>}
    </section>
  );
}
