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
- **Settings…** — any IANA timezone, custom label, 12/24-hour, seconds,
  show the date too

Works on GNOME Shell 45–50.

## Files

- `extension.js` — panel clock, sits at position 1 of the panel's centre box
  (the built-in date/time is position 0)
- `prefs.js` — settings window (Adw)
- `schemas/` — GSettings for timezone / label / format
