import type { ReactNode } from 'react';

// Turns [label](https://…) and bare https:// addresses in guide text into links.
const LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)]+[^\s).,;:!?])/g;

export function LinkedText({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const url = m[2] ?? m[3];
    out.push(
      <a key={at} href={url} target="_blank" rel="noopener noreferrer">
        {m[1] ?? url}
      </a>,
    );
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}
