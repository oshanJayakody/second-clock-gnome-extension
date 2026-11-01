# Second Clock — GNOME Shell extension

<img width="480" height="33" alt="Screenshot From 2026-10-24 21-15-25" src="https://github.com/user-attachments/assets/5af55c94-9d6f-48de-840c-f1a36e67c00c" />
<img width="491" height="276" alt="Screenshot From 2026-10-24 21-22-03" src="https://github.com/user-attachments/assets/f19edc87-6ae7-4783-86c8-8e0bdef7de5f" />

Shows a **second clock in the centre of the top panel, right beside GNOME's
built-in date and time**.

Default: **Sri Lanka time** — the panel shows e.g. `Sri Lanka  14:32` next to
your Melbourne clock. Sri Lanka is 5h30 ahead of UTC; Melbourne is 10h/11h,
so it's normally 4h30–5h30 behind you (the extension works it out live,
including daylight saving).

## Install

```bash
gnome-extensions install ~/Downloads/second-clock@kusalanka.local.zip
# then log out and back in (on Wayland), or Alt+F2, r, Enter (on X11)
gnome-extensions enable second-clock@kusalanka.local
```

Or with the GUI: open **Extensions** (or Extension Manager), it appears as
"Second Clock" after installing the zip and restarting the shell.

## Change it

Click the second clock in the panel:

- **Switch timezone** — quick list (Colombo, Melbourne, Dubai, Singapore,
  London, New York, Los Angeles, Tokyo)
- **Settings…** — any IANA timezone, custom label, 12/24-hour,
  show the date too; plus weather place and Pomodoro lengths

Works on GNOME Shell 45–50.

## Files

- `extension.js` — panel clock, sits at position 1 of the panel's centre box
  (the built-in date/time is position 0)
- `lib.js` — timezone/weather helpers
- `prefs.js` — settings window (Adw)
- `schemas/` — GSettings for timezone / label / format

## v5 — Weather, Pomodoro, Caffeine (2026-11-01)

- **Seconds removed everywhere.** The clock now wakes once a minute, aligned
  to the minute boundary — no 1-second tick, so idle power use is effectively
  zero. The Pomodoro is the only thing that ticks per-second, and only while
  a session is running.
- **Weather** next to the clock (symbol + temperature), with today's min/max,
  humidity and wind in the menu. Source: Open-Meteo (free, no API key),
  default Melbourne; presets in the menu, any coordinates in Settings.
- **Pomodoro** in the menu: start/pause/resume/reset, presets 25/5, 50/10,
  15/3, 45/15, panel countdown while running, notifications, sessions counter.
- **Caffeine** in the menu: stay-awake switch (SessionManager inhibit), with
  a ☕ shown in the panel while it's on.

Note on Shexli: version 0.2.1 segfaults inside its own AST walker when
analyzing the v5 extension.js (a Shexli bug — the file passes `node --check`,
and v4 analyzed clean). Manual guideline checks for v5: all timers removed in
`destroy()`, GSettings signal disconnected in `destroy()`, Soup session
aborted in `destroy()`.

## v6 — Tabbed settings + widget theme (2026-11-01)

- Settings are now separate tabs: **Clock**, **Weather**, **Pomodoro**,
  **Caffeine** (the Caffeine tab is new: turn on at start, panel ☕ toggle,
  auto-off after N minutes).
- Restyled to the dark "widget" look: the clock sits in a soft pill in the
  panel, and the dropdown is a dark floating card with rounded corners and
  muted text (see `stylesheet.css`).

## v7 — Real widget theme (2026-11-01)

The reference for the theme is GNOME's own calendar widgets (Today /
World Clocks / Weather cards), not the plain menu in the older screenshot:

- The dropdown is now a stack of **section cards**: a **World Clock** card
  (`Colombo … 5:34 AM … -5:30`, like the built-in one), a **Weather** card
  with an **hourly forecast strip** (next 5 hours: time, icon, temperature —
  the hourly data now comes from Open-Meteo too), a **Pomodoro** card and a
  **Caffeine** card. Actions (switch timezone, presets, settings…) stay as
  plain rows under their cards.

## v8 — Settings own the changes; small Pomodoro buttons (2026-11-01)

- Widget menu no longer changes configuration: **Switch timezone** and
  **Weather location** are gone from the dropdown — both live in Settings
  (Clock tab dropdown, Weather tab town list). Refresh weather stays.
- Weather tab: **Celsius/Fahrenheit** switch (applies to the panel, the
  current conditions and the hourly strip), and a **Town dropdown** of
  frequent towns (Australian capitals, Colombo/Kandy/Galle, world cities).
  Pick **Custom…** and name/latitude/longitude fields appear for any other
  town.
- Pomodoro: the three long rows are gone. The card now has one row of small
  buttons — ▶ Start/⏸ Pause (icon + short label), a ↺ reset icon button, and
  compact length presets `25/5 50/10 15/3 45/15`.

## v9 — Pomodoro favourites (2026-11-01)

- Three **favourite lengths** you set yourself in Settings → Pomodoro →
  Favourites (defaults **5, 10, 30 min**). They replace the old preset
  buttons in the widget; tapping one loads that length.
- The widget no longer shows break time anywhere: buttons and the card show
  only the full length as plain text (`5 min`, `10 min`, `30 min`).
