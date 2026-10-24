# Moonlight — Halloween Costume Ballot

A small React + TypeScript app for managing a Halloween costume lineup, collecting votes, and revealing the winner (or a tie) when the ballot closes. Express stores all event data in a local SQLite database file.

## Requirements

- Node.js 20.19+ or 22.12+
- npm

## Run locally

1. Install dependencies: `npm install`
2. Start the API and Vite development server: `npm run dev`
3. Open the local address printed by Vite (usually `http://localhost:5173`).

The API runs on port 3001 and Vite proxies `/api` requests to it. The database is created automatically at `data/halloween.sqlite` the first time the server starts.

## Use the pages

### Voter page — `/`

Voters choose a name from the dropdown and submit a vote. Contestant management and ballot controls are not shown on this page. The live totals stay hidden while voting is open; after the ballot closes, the winner(s) and full tally are shown here.

### Admin page — `/admin`

Add each costumed person's name under **Contestant Lineup**. Names are trimmed, limited to 60 characters, and duplicates are rejected without regard to capitalization. When everyone has voted, choose **End voting** and confirm. This permanently closes the ballot. Ties are shown together; if no votes were cast, no winner is declared.

Use the × beside a contestant to remove them before closing the ballot. Removing a contestant also removes any votes already cast for them.

After closing, use **Reopen voting** on `/admin` if you need to accept more ballots. Previously cast votes are kept, and voters can submit additional votes while the ballot is open again. Close the ballot again to show the updated tally.

Use **Clear all data** at the bottom of `/admin` to remove every contestant and vote and reopen the ballot for a fresh event. This action cannot be undone.

The **Repeat voting** switch on `/admin` controls browser-ID enforcement. When disabled, each browser can vote once. When enabled, a voter can submit multiple votes from the same browser. Voter pages refresh the setting automatically; the option is saved with the event, and clearing all data resets it to disabled.

When repeat voting is disabled, a persistent browser ID is checked and recorded by the API. This is a casual-event safeguard, not verified identity: people can use another browser/device or clear browser storage. IP blocking is intentionally not used because people on shared networks may appear to have the same public IP. The admin page also has no authentication; keep it on a trusted device/network because anyone who can access `/admin` can manage and close the ballot.

## Production build

Run `npm run build`, then `npm start`. Express serves the built frontend and API on port 3001. Set `PORT` to use another port.

## Reset for another event

Stop the server and delete `data/halloween.sqlite`. The next server start creates a fresh lineup and ballot. The SQLite file is ignored by Git so names and votes remain local.
