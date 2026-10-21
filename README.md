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

## Trying both sides

Until real sign-in exists, the dark bar at the top says **Viewing as**. Switch between Rick (a guest), Maddie or Tyler (kids), and Pete or Trisha (owners). **Reset sample data** puts everything back.

Data lives in your browser for now (localStorage), so each browser has its own copy. Rick, Maddie and Tyler are made-up examples.

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

## Connecting a real backend later

All reads and writes go through `DataStore` in `src/data/store.ts`. To move to Supabase, Firebase or Cloudflare D1, write one class that implements it (e.g. `SupabaseStore`) and change the single line in `src/data/index.ts`. No screen code changes. That step also brings real sign-in (email link), automatic emails, and replaces the "Viewing as" bar.

## Nothing private in this repo

This repo is public. Phone numbers, emails, the street address, Wi-Fi details and door codes are never in the code. Owners enter them in the app: contacts in **People**, address and Wi-Fi in **Owner › Guide › Cabin settings**, door codes on each stay. Once the backend is connected they live in the database behind sign-in.

## Publishing

Every push to `main` runs `.github/workflows/deploy.yml`, which type-checks, builds and publishes to GitHub Pages (free for public repos). Until a backend is connected, each visitor only sees their own sample data in their own browser.
