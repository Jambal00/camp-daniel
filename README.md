# Camp Daniel

A phone-first app for friends and family to request stays at Camp Daniel, and for Pete & Trisha to approve them. Version C of the mockups.

## Run it on your computer

You need Node.js 20 or newer. In a terminal (PowerShell is fine):

```
node -v            # if this fails, install the LTS version from nodejs.org
cd ~/Documents/camp-daniel
npm install        # first time only
npm run dev
```

Open the address it prints (usually http://localhost:5173). To try it on your phone, use the "Network" address it prints while your phone is on the same Wi-Fi.

## Two ways to run it

- `npm run dev` uses **Firebase**: real sign-in (Google or an emailed link) and shared data. The first time an owner signs in, the cabin guide and settings are set up automatically.
- `npm run dev:demo` uses **sample data kept in your browser**, with a "Viewing as" bar to switch between a guest (Rick, Maddie, Tyler, all made up) and an owner. Handy for trying ideas without touching real data.

## What works

**Guests:** calendar with open weekends and a featured next open weekend · request dates (one screen) · request-sent confirmation · My trip (timeline, countdown, welcome note, door code and Wi-Fi that unlock at noon on arrival day, tap-to-text Pete about the cameras, "heading out" text with notes) · seasonal cabin guide with status chips and the exit checklist · contact Pete & Trisha.

**Owners:** Needs you (requests sorted by dibs, 26-weekend goal) · approve with welcome note and door code, then email or text it from your phone · decline · calendar colored by group, block dates for yourselves, book on someone's behalf · edit any guide section, flip amenity status (golf cart: out of order) · Wi-Fi, season and welcome template settings · people list with invites and stays per person.

## Project layout

```
src/
  data/
    types.ts        shapes of people, bookings, guide sections, settings
    store.ts        the DataStore interface every backend implements
    localStore.ts   today's backend: this browser's localStorage
    seed.ts         sample people and bookings
    guide.ts        guide content adapted from the Cabin Guide PDF
    index.ts        picks the backend (one line to change)
  lib/              dates, booking rules, routing, who's signed in
  components/       calendar, tab bar, chips, icons, toast
  screens/guest/    Home, Request, Sent, Trip, Guide, GuideSection, Contact
  screens/owner/    OwnerHome, Approve, OwnerCalendar, OwnerGuide, People
```

## Data and security

All reads and writes go through `DataStore` in `src/data/store.ts`. `FirebaseStore` (`src/data/firebaseStore.ts`) is the live backend; `LocalStore` is the demo one.

Who can see what is enforced by Firestore security rules, kept in the Firebase console (not in this repo, since they list the owner emails):
- Guests see only their own stays, plus other stays as "Booked" with no names.
- Door codes and Wi-Fi live in a separate record each guest can read only from noon on arrival day through departure day.
- Only owners can approve, edit the guide, or invite people.

Free-plan note: Firebase allows 5 sign-in-link emails a day. Google sign-in has no daily cap, and people stay signed in on their phones.

## Nothing private in this repo

This repo is public. Phone numbers, emails, the street address, Wi-Fi details and door codes are never in the code. Owners enter them in the app: contacts in **People**, address and Wi-Fi in **Owner › Guide › Cabin settings**, door codes on each stay. Once the backend is connected they live in the database behind sign-in.

## Publishing

Every push to `main` runs `.github/workflows/deploy.yml`, which type-checks, builds and publishes to GitHub Pages (free for public repos). Until a backend is connected, each visitor only sees their own sample data in their own browser.
