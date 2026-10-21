import { GUEST_TABS, ownerTabs, TabBar } from './components/TabBar';
import { Toaster } from './components/Toast';
import { store, useSnapshot } from './data';
import { TIER_LABEL } from './data/types';
import { needsDecision } from './lib/cabin';
import { go, useRoute, type Route } from './lib/router';
import { SessionProvider, useSession } from './lib/session';
import { Contact } from './screens/guest/Contact';
import { Guide } from './screens/guest/Guide';
import { GuideSection } from './screens/guest/GuideSection';
import { Home } from './screens/guest/Home';
import { Request } from './screens/guest/Request';
import { Sent } from './screens/guest/Sent';
import { Trip } from './screens/guest/Trip';
import { Approve } from './screens/owner/Approve';
import { OwnerCalendar } from './screens/owner/OwnerCalendar';
import { EditSection, OwnerGuide } from './screens/owner/OwnerGuide';
import { OwnerHome } from './screens/owner/OwnerHome';
import { People } from './screens/owner/People';

export default function App() {
  const snap = useSnapshot();
  if (!snap) return <div className="screen muted">Loading Camp Daniel…</div>;
  return (
    <SessionProvider snap={snap}>
      <Shell />
    </SessionProvider>
  );
}

/** Development helper: switch who you are until real sign-in exists. */
function DevBar() {
  const { snap, me, setMe } = useSession();
  return (
    <div className="devbar">
      <label htmlFor="viewas">Viewing as</label>
      <select
        id="viewas"
        value={me.id}
        onChange={(e) => {
          const next = snap.people.find((p) => p.id === e.target.value);
          setMe(e.target.value);
          go(next?.tier === 'owner' ? '/owner' : '/');
        }}
      >
        {snap.people.map((p) => <option key={p.id} value={p.id}>{p.shortName} · {TIER_LABEL[p.tier]}</option>)}
      </select>
      <button
        type="button"
        onClick={async () => {
          await store.reset?.();
          go(me.tier === 'owner' ? '/owner' : '/');
        }}
      >
        Reset sample data
      </button>
    </div>
  );
}

function Shell() {
  const route = useRoute();
  const { snap, isOwner } = useSession();
  const screen = pickScreen(route, isOwner);
  const fullScreen = ['request', 'sent'].includes(route.path[0]) || route.path[1] === 'approve' || (route.path[0] === 'owner' && route.path[1] === 'guide' && route.path[2]);
  const tabs = route.path[0] === 'owner' && isOwner ? ownerTabs(needsDecision(snap).length) : GUEST_TABS;

  return (
    <div className="app">
      {/* Until real sign-in exists, the dev bar is how you switch between guest and owner. */}
      {import.meta.env.VITE_HIDE_DEVBAR ? null : <DevBar />}
      {screen}
      {!fullScreen && <TabBar tabs={tabs} path={route.path} />}
      <Toaster />
    </div>
  );
}

function pickScreen({ path, query }: Route, isOwner: boolean) {
  const [a, b, c] = path;
  if (a === 'owner') {
    if (!isOwner) return <Home />;
    if (b === 'approve' && c) return <Approve id={c} />;
    if (b === 'calendar') return <OwnerCalendar />;
    if (b === 'guide' && c) return <EditSection id={c} />;
    if (b === 'guide') return <OwnerGuide />;
    if (b === 'people') return <People />;
    return <OwnerHome />;
  }
  if (a === 'request') return <Request route={{ path, query }} />;
  if (a === 'sent' && b) return <Sent id={b} />;
  if (a === 'trip') return <Trip />;
  if (a === 'guide' && b) return <GuideSection id={b} />;
  if (a === 'guide') return <Guide />;
  if (a === 'contact') return <Contact />;
  if (isOwner && !a) return <OwnerHome />;
  return <Home />;
}
