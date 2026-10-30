import { href } from '../lib/router';
import { Icon } from './Icon';

export interface Tab {
  to: string;
  label: string;
  icon: string;
  match: (path: string[]) => boolean;
  badge?: number;
}

export function TabBar({ tabs, path }: { tabs: Tab[]; path: string[] }) {
  return (
    <nav className="tabbar" aria-label="Main" style={{ ['--tabs' as string]: tabs.length }}>
      {tabs.map((t) => (
        <a key={t.label} href={href(t.to)} className={t.match(path) ? 'on' : ''} aria-current={t.match(path) ? 'page' : undefined}>
          <Icon name={t.icon} />
          {t.label}
          {t.badge ? <span className="badge">{t.badge}</span> : null}
        </a>
      ))}
    </nav>
  );
}

export const GUEST_TABS: Tab[] = [
  { to: '/', label: 'Calendar', icon: 'calendar', match: (p) => p.length === 0 || p[0] === 'request' || p[0] === 'sent' },
  { to: '/trip', label: 'My trip', icon: 'home', match: (p) => p[0] === 'trip' },
  { to: '/guide', label: 'Guide', icon: 'book', match: (p) => p[0] === 'guide' },
  { to: '/contact', label: 'Pete & Trish', icon: 'chat', match: (p) => p[0] === 'contact' },
  { to: '/alerts', label: 'Alerts', icon: 'bell', match: (p) => p[0] === 'alerts' },
];

export function ownerTabs(pending: number): Tab[] {
  return [
    { to: '/owner', label: 'Requests', icon: 'inbox', match: (p) => p.length === 0 || (p[0] === 'owner' && (!p[1] || p[1] === 'approve')), badge: pending },
    { to: '/owner/calendar', label: 'Calendar', icon: 'calendar', match: (p) => p[1] === 'calendar' },
    { to: '/owner/guide', label: 'Guide', icon: 'edit', match: (p) => p[1] === 'guide' },
    { to: '/owner/people', label: 'People', icon: 'people', match: (p) => p[1] === 'people' },
    { to: '/owner/alerts', label: 'Alerts', icon: 'bell', match: (p) => p[1] === 'alerts' },
  ];
}
