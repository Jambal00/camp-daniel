import { useEffect, useState } from 'react';
import { listenForNotificationTaps } from './lib/push';
import { Alerts } from './screens/Alerts';
import { GroupTripNew, GroupTripView } from './screens/owner/GroupTrips';
import { GroupVote } from './screens/guest/GroupVote';
import { GUEST_TABS, ownerTabs, TabBar } from './components/TabBar';
import { Toaster } from './components/Toast';
import { ViewSwitch } from './components/PreviewBar';
import { UpdateBanner, VersionLabel } from './components/UpdateBanner';
import { MODE, store, useData } from './data';
import { NotInvited, SignIn, SignOutButton } from './screens/SignIn';
import { TIER_LABEL } from './data/types';
import { needsDecision } from './lib/cabin';
import { go, useRoute, type Route } from './lib/router';
import { SessionProvider, useSession } from './lib/session';
import { Board } from './screens/guest/Board';
import { PhotosHub } from './screens/guest/PhotosHub';
import { Contact } from './screens/guest/Contact';
import { Guide } from './screens/guest/Guide';
import { GuideSection } from './screens/guest/GuideSection';
import { Home } from './screens/guest/Home';
import { Request } from './screens/guest/Request';
import { Sent } from './screens/guest/Sent';
import { Trip } from './screens/guest/Trip';
import { Approve } from './screens/owner/Approve';
import { OwnerAlbum } from './screens/owner/OwnerAlbum';
import { Questions } from './screens/owner/Questions';
import { AskButton } from './screens/guest/Ask';
import { OwnerCalendar } from './screens/owner/OwnerCalendar';
import { EditSection, OwnerGuide } from './screens/owner/OwnerGuide';
import { OwnerHome } from './screens/owner/OwnerHome';
import { People } from './screens/owner/People';

/** Loading screen that offers a way out if it takes too long. */
function Loading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), 10000);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <main className="screen">
      <div className="muted">Loading Camp Daniel…</div>
      <UpdateBanner />
      {slow && (
        <>
          <div className="callout">This is taking longer than usual. A reload usually fixes it, especially right after an update.</div>
          <button className="btn" onClick={() => window.location.replace(`${window.location.pathname}?v=${Date.now()}#/`)}>Reload</button>
        </>
      )}
    </main>
  );
}

export default function App() {
  const data = useData();
  useEffect(() => listenForNotificationTaps(), []);
  switch (data.status) {
    case 'loading':
      return <Loading />;
    case 'signed-out':
      return <SignIn />;
    case 'not-invited':
      return <NotInvited email={data.email} />;
    case 'not-set-up':
      return <NotInvited email={data.email} setUp />;
    case 'error':
      return (
        <main className="screen">
          <h1 className="title">Couldn't load Camp Daniel</h1>
          <div className="alert">{data.message}</div>
          <button className="btn" onClick={() => window.location.replace(`${window.location.pathname}?v=${Date.now()}#/`)}>Reload</button>
          <SignOutButton />
          <VersionLabel />
        </main>
      );
    case 'ready':
      return (
        <SessionProvider snap={data.snap} meId={data.meId}>
          <Shell />
        </SessionProvider>
      );
  }
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
  // Owners get the owner tabs on their home screen too; guest pages they open (guide preview) keep guest tabs.
  const ownerArea = isOwner && (route.path[0] === 'owner' || route.path.length === 0);
  const showAsk = !fullScreen && !isOwner;
  const tabs = ownerArea ? ownerTabs(needsDecision(snap).length) : GUEST_TABS;

  return (
    <div className={`app${showAsk ? ' has-fab' : ''}`}>
      <UpdateBanner />
      {/* Sample-data mode only: switch between guest and owner. */}
      {MODE === 'local' ? <DevBar /> : null}
      <ViewSwitch />
      {screen}
      {!fullScreen && <TabBar tabs={tabs} path={route.path} />}
      {showAsk && <AskButton />}
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
    if (b === 'album') return <OwnerAlbum />;
    if (b === 'questions') return <Questions />;
    if (b === 'guests') return <Board />;
    if (b === 'guide' && c) return <EditSection key={c} id={c} group={query.get('group')} amenity={query.get('amenity') === '1'} />;
    if (b === 'guide') return <OwnerGuide />;
    if (b === 'people') return <People />;
    if (b === 'alerts') return <Alerts />;
    if (b === 'group' && c === 'new') return <GroupTripNew />;
    if (b === 'group' && c) return <GroupTripView id={c} />;
    return <OwnerHome />;
  }
  if (a === 'request') return <Request route={{ path, query }} />;
  if (a === 'sent' && b) return <Sent id={b} />;
  if (a === 'trip') return <Trip />;
  if (a === 'guide' && b) return <GuideSection id={b} />;
  if (a === 'guide') return <Guide />;
  if (a === 'contact') return <Contact />;
  if (a === 'alerts') return <Alerts />;
  if (a === 'group' && b) return <GroupVote id={b} />;
  if (a === 'photos') return <PhotosHub tab={query.get('tab') === 'guests' ? 'guests' : 'album'} stayId={query.get('stay')} />;
  if (a === 'album') return <PhotosHub tab="album" />;
  if (a === 'guests') return <PhotosHub tab="guests" />;
  if (isOwner && !a) return <OwnerHome />;
  return <Home />;
}
