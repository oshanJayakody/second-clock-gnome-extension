// Second Clock + Weather + Pomodoro + Caffeine
// A second timezone clock in the centre of the top panel, beside GNOME's
// built-in date and time. The clock now updates once per minute (aligned to
// the minute boundary) — no seconds anywhere, so it costs almost no power.
// Weather: Open-Meteo (free, no API key), refreshed on an interval.
// Pomodoro: 1-second ticking only while a session is running.
// Caffeine: inhibits suspend/idle via the GNOME SessionManager.

import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Soup from 'gi://Soup';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {QUICK_ZONES, WEATHER_PLACES, makeTimeZone, weatherInfo, fmtCountdown} from './lib.js';

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.5, 'Second Clock', false);
        this._extension = extension;
        this._settings = extension.getSettings();

        // Theme: pill in the panel + dark rounded menu (see stylesheet.css)
        this.add_style_class_name('second-clock-button');
        this.menu.actor.add_style_class_name('second-clock-menu');

        this._clockTimer = 0;
        this._weatherTimer = 0;
        this._weather = null;
        this._weatherFetchedAt = 0;
        this._soupSession = new Soup.Session();
        this._inhibitCookie = 0;
        this._caffeineTimer = 0;

        // Pomodoro state: phase 'idle' | 'work' | 'break'
        this._pomo = {
            phase: 'idle',
            running: false,
            remaining: this._settings.get_int('pomodoro-work') * 60,
            endAt: 0,
            timer: 0,
            sessions: 0,
        };

        this._label = new St.Label({
            text: '',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'second-clock-label',
        });
        this.add_child(this._label);

        this._buildMenu();

        this._settingsChangedId = this._settings.connect('changed', () => {
            this._tickClock();
            this._render();
        });

        this.menu.connect('open-state-changed', (_m, open) => {
            if (open) {
                this._tickClock();
                const staleFor = this._settings.get_int('weather-refresh') * 60 * 1000;
                if (Date.now() - this._weatherFetchedAt > staleFor)
                    this._fetchWeather();
            }
        });

        this._tickClock();
        this._scheduleClockTimer();
        this._fetchWeather();
        this._scheduleWeatherTimer();
        this._render();

        if (this._settings.get_boolean('caffeine-on-start')) {
            this._caffeineItem.setToggleState(true);
            this._setCaffeine(true);
        }
    }

    _buildMenu() {
        // ---- Clock section ----
        this._fullItem = new PopupMenu.PopupMenuItem('', {reactive: false});
        this._localItem = new PopupMenu.PopupMenuItem('', {reactive: false});
        this._diffItem = new PopupMenu.PopupMenuItem('', {reactive: false});
        this.menu.addMenuItem(this._fullItem);
        this.menu.addMenuItem(this._localItem);
        this.menu.addMenuItem(this._diffItem);

        const zoneMenu = new PopupMenu.PopupSubMenuMenuItem('Switch timezone');
        for (const [name, tz] of QUICK_ZONES) {
            const mi = new PopupMenu.PopupMenuItem(name);
            mi.connect('activate', () => {
                this._settings.set_string('timezone', tz);
                this._settings.set_string('label', name === 'Melbourne / Sydney' ? 'Melbourne' : name);
            });
            zoneMenu.menu.addMenuItem(mi);
        }
        this.menu.addMenuItem(zoneMenu);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // ---- Weather section ----
        this._weatherItem = new PopupMenu.PopupMenuItem('Weather: …', {reactive: false});
        this._weatherDetailItem = new PopupMenu.PopupMenuItem('', {reactive: false});
        this.menu.addMenuItem(this._weatherItem);
        this.menu.addMenuItem(this._weatherDetailItem);

        const placeMenu = new PopupMenu.PopupSubMenuMenuItem('Weather location');
        for (const [name, lat, lon] of WEATHER_PLACES) {
            const mi = new PopupMenu.PopupMenuItem(name);
            mi.connect('activate', () => {
                this._settings.set_string('weather-label', name);
                this._settings.set_string('weather-lat', lat);
                this._settings.set_string('weather-lon', lon);
                this._fetchWeather();
            });
            placeMenu.menu.addMenuItem(mi);
        }
        this.menu.addMenuItem(placeMenu);

        const refreshItem = new PopupMenu.PopupMenuItem('Refresh weather now');
        refreshItem.connect('activate', () => this._fetchWeather());
        this.menu.addMenuItem(refreshItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // ---- Pomodoro section ----
        this._pomoStatusItem = new PopupMenu.PopupMenuItem('', {reactive: false});
        this.menu.addMenuItem(this._pomoStatusItem);

        this._pomoToggleItem = new PopupMenu.PopupMenuItem('Start Pomodoro');
        this._pomoToggleItem.connect('activate', () => this._pomoToggle());
        this.menu.addMenuItem(this._pomoToggleItem);

        const pomoResetItem = new PopupMenu.PopupMenuItem('Reset Pomodoro');
        pomoResetItem.connect('activate', () => this._pomoReset());
        this.menu.addMenuItem(pomoResetItem);

        const pomoPresetMenu = new PopupMenu.PopupSubMenuMenuItem('Pomodoro lengths');
        for (const [name, work, brk] of [['25 / 5', 25, 5], ['50 / 10', 50, 10], ['15 / 3', 15, 3], ['45 / 15', 45, 15]]) {
            const mi = new PopupMenu.PopupMenuItem(`${name} min`);
            mi.connect('activate', () => {
                this._settings.set_int('pomodoro-work', work);
                this._settings.set_int('pomodoro-break', brk);
                this._pomoReset();
            });
            pomoPresetMenu.menu.addMenuItem(mi);
        }
        this.menu.addMenuItem(pomoPresetMenu);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // ---- Caffeine section ----
        this._caffeineItem = new PopupMenu.PopupSwitchMenuItem('Caffeine (stay awake)', false);
        this._caffeineItem.connect('toggled', (_i, state) => this._setCaffeine(state));
        this.menu.addMenuItem(this._caffeineItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const prefsItem = new PopupMenu.PopupMenuItem('Settings…');
        prefsItem.connect('activate', () => this._extension.openPreferences());
        this.menu.addMenuItem(prefsItem);
    }

    // ---------- Clock (no seconds; wakes once a minute) ----------
    _tickClock() {
        const tzId = this._settings.get_string('timezone') || 'Asia/Colombo';
        const tz = makeTimeZone(tzId);
        const now = tz ? GLib.DateTime.new_now(tz) : GLib.DateTime.new_now_local();
        const local = GLib.DateTime.new_now_local();

        const fmt = this._settings.get_boolean('use-24h') ? '%H:%M' : '%I:%M %p';
        const dateFmt = this._settings.get_boolean('show-date') ? `%a %d %b ${fmt}` : fmt;
        this._clockText = now.format(dateFmt) ?? '';

        const label = this._settings.get_boolean('show-label')
            ? this._settings.get_string('label').trim() : '';
        this._clockLabel = label;

        this._fullItem.label.text = `${label || tzId}:  ${now.format('%A, %d %B %Y, %H:%M')}`;
        this._localItem.label.text = `Local:  ${local.format('%A, %d %B %Y, %H:%M')} (${local.get_timezone_abbreviation()})`;

        const diffHours = (now.get_utc_offset() - local.get_utc_offset()) / 3600000000;
        const abs = Math.abs(diffHours);
        const hrs = Number.isInteger(abs) ? `${abs}` : abs.toFixed(1);
        this._diffItem.label.text = diffHours === 0
            ? 'Same time as local right now'
            : `${label || tzId} is ${hrs}h ${diffHours > 0 ? 'ahead of' : 'behind'} local time`;
    }

    _scheduleClockTimer() {
        if (this._clockTimer) {
            GLib.source_remove(this._clockTimer);
            this._clockTimer = 0;
        }
        // Milliseconds until just past the next minute boundary
        const now = GLib.DateTime.new_now_local();
        const msIntoMinute = now.get_second() * 1000 + Math.floor(now.get_microsecond() / 1000);
        const delay = 60000 - msIntoMinute + 100;
        this._clockTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this._clockTimer = 0;
            this._tickClock();
            this._render();
            this._scheduleClockTimer();
            return GLib.SOURCE_REMOVE;
        });
    }

    // ---------- Weather (Open-Meteo, no API key) ----------
    _scheduleWeatherTimer() {
        if (this._weatherTimer)
            GLib.source_remove(this._weatherTimer);
        const mins = Math.max(10, this._settings.get_int('weather-refresh'));
        this._weatherTimer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, mins * 60, () => {
            this._fetchWeather();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _fetchWeather() {
        if (!this._settings.get_boolean('show-weather')) {
            this._weather = null;
            this._render();
            return;
        }
        const lat = parseFloat(this._settings.get_string('weather-lat'));
        const lon = parseFloat(this._settings.get_string('weather-lon'));
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            this._weatherItem.label.text = 'Weather: set a valid location in Settings';
            return;
        }
        const url = 'https://api.open-meteo.com/v1/forecast' +
            `?latitude=${lat}&longitude=${lon}` +
            '&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m' +
            '&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1';
        const message = Soup.Message.new('GET', url);
        this._soupSession.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (session, result) => {
            try {
                const bytes = session.send_and_read_finish(result);
                const data = JSON.parse(new TextDecoder().decode(bytes.get_data()));
                const cur = data.current;
                const [desc, symbol] = weatherInfo(cur.weather_code);
                this._weather = {
                    temp: Math.round(cur.temperature_2m),
                    desc,
                    symbol,
                    humidity: cur.relative_humidity_2m,
                    wind: Math.round(cur.wind_speed_10m),
                    max: Math.round(data.daily.temperature_2m_max[0]),
                    min: Math.round(data.daily.temperature_2m_min[0]),
                };
                this._weatherFetchedAt = Date.now();
            } catch (e) {
                this._weather = null;
                this._weatherItem.label.text = 'Weather: unavailable (offline?)';
                this._weatherDetailItem.label.text = '';
            }
            this._render();
        });
    }

    // ---------- Pomodoro ----------
    _pomoToggle() {
        if (this._pomo.phase === 'idle') {
            this._pomo.phase = 'work';
            this._pomo.remaining = this._settings.get_int('pomodoro-work') * 60;
            this._pomoStart();
        } else if (this._pomo.running) {
            // pause
            this._pomo.remaining = Math.max(0, (this._pomo.endAt - GLib.get_monotonic_time()) / 1000000);
            this._pomoStopTimer();
            this._pomo.running = false;
        } else {
            this._pomoStart();
        }
        this._render();
    }

    _pomoStart() {
        this._pomo.endAt = GLib.get_monotonic_time() + this._pomo.remaining * 1000000;
        this._pomo.running = true;
        this._pomoStopTimer();
        this._pomo.timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            this._pomo.remaining = Math.max(0, (this._pomo.endAt - GLib.get_monotonic_time()) / 1000000);
            if (this._pomo.remaining <= 0) {
                this._pomoPhaseDone();
                return GLib.SOURCE_REMOVE;
            }
            this._render();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _pomoStopTimer() {
        if (this._pomo.timer) {
            GLib.source_remove(this._pomo.timer);
            this._pomo.timer = 0;
        }
    }

    _pomoPhaseDone() {
        this._pomoStopTimer();
        this._pomo.running = false;
        if (this._pomo.phase === 'work') {
            this._pomo.sessions++;
            Main.notify('Pomodoro', `Work session ${this._pomo.sessions} done — take a ${this._settings.get_int('pomodoro-break')} minute break.`);
            this._pomo.phase = 'break';
            this._pomo.remaining = this._settings.get_int('pomodoro-break') * 60;
            this._pomoStart();
        } else {
            Main.notify('Pomodoro', 'Break over — ready for the next session?');
            this._pomo.phase = 'idle';
            this._pomo.remaining = this._settings.get_int('pomodoro-work') * 60;
        }
        this._render();
    }

    _pomoReset() {
        this._pomoStopTimer();
        this._pomo.phase = 'idle';
        this._pomo.running = false;
        this._pomo.remaining = this._settings.get_int('pomodoro-work') * 60;
        this._render();
    }

    // ---------- Caffeine ----------
    _setCaffeine(on) {
        if (on && !this._inhibitCookie) {
            Gio.DBus.session.call('org.gnome.SessionManager', '/org/gnome/SessionManager',
                'org.gnome.SessionManager', 'Inhibit',
                new GLib.Variant('(susu)', ['second-clock@kusalanka.local', 0, 'Caffeine (Second Clock)', 12]),
                new GLib.VariantType('(u)'), Gio.DBusCallFlags.NONE, -1, null,
                (conn, res) => {
                    try {
                        this._inhibitCookie = conn.call_finish(res).deep_unpack()[0];
                        this._render();
                        const mins = this._settings.get_int('caffeine-duration');
                        if (mins > 0) {
                            this._caffeineTimer = GLib.timeout_add_seconds(
                                GLib.PRIORITY_DEFAULT, mins * 60, () => {
                                    this._caffeineTimer = 0;
                                    this._caffeineItem.setToggleState(false);
                                    this._setCaffeine(false);
                                    Main.notify('Caffeine', 'Auto-off: stay-awake turned off.');
                                    return GLib.SOURCE_REMOVE;
                                });
                        }
                    } catch {
                        this._caffeineItem.setToggleState(false);
                    }
                });
        } else if (!on) {
            if (this._caffeineTimer) {
                GLib.source_remove(this._caffeineTimer);
                this._caffeineTimer = 0;
            }
            if (this._inhibitCookie) {
                Gio.DBus.session.call('org.gnome.SessionManager', '/org/gnome/SessionManager',
                    'org.gnome.SessionManager', 'Uninhibit',
                    new GLib.Variant('(u)', [this._inhibitCookie]),
                    null, Gio.DBusCallFlags.NONE, -1, null, null);
                this._inhibitCookie = 0;
            }
            this._render();
        }
    }

    // ---------- Panel rendering ----------
    _render() {
        const parts = [];
        const label = this._clockLabel ?? '';
        parts.push(label ? `${label}  ${this._clockText ?? ''}` : (this._clockText ?? ''));

        if (this._settings.get_boolean('show-weather') && this._weather)
            parts.push(`${this._weather.symbol} ${this._weather.temp}°C`);

        if (this._pomo.phase !== 'idle')
            parts.push(`⏱ ${fmtCountdown(this._pomo.remaining)}`);

        if (this._inhibitCookie && this._settings.get_boolean('show-caffeine-icon'))
            parts.push('☕');

        this._label.text = parts.join('   ');

        // Menu weather lines
        if (this._weather) {
            const place = this._settings.get_string('weather-label') || 'Weather';
            this._weatherItem.label.text = `${place}: ${this._weather.symbol} ${this._weather.temp}°C, ${this._weather.desc}`;
            this._weatherDetailItem.label.text = `Today ${this._weather.min}–${this._weather.max}°C · Humidity ${this._weather.humidity}% · Wind ${this._weather.wind} km/h`;
        } else if (this._settings.get_boolean('show-weather')) {
            if (this._weatherItem.label.text === '')
                this._weatherItem.label.text = 'Weather: …';
        } else {
            this._weatherItem.label.text = 'Weather: off (enable in Settings)';
            this._weatherDetailItem.label.text = '';
        }

        // Menu pomodoro lines
        if (this._pomo.phase === 'idle') {
            this._pomoStatusItem.label.text = `Pomodoro: ready (${this._settings.get_int('pomodoro-work')} min work / ${this._settings.get_int('pomodoro-break')} min break) · ${this._pomo.sessions} done`;
            this._pomoToggleItem.label.text = 'Start Pomodoro';
        } else {
            const phaseName = this._pomo.phase === 'work' ? 'Work' : 'Break';
            this._pomoStatusItem.label.text = `Pomodoro: ${phaseName} — ${fmtCountdown(this._pomo.remaining)} ${this._pomo.running ? '' : '(paused)'} · ${this._pomo.sessions} done`;
            this._pomoToggleItem.label.text = this._pomo.running ? 'Pause Pomodoro' : 'Resume Pomodoro';
        }
    }

    destroy() {
        if (this._clockTimer) {
            GLib.source_remove(this._clockTimer);
            this._clockTimer = 0;
        }
        if (this._weatherTimer) {
            GLib.source_remove(this._weatherTimer);
            this._weatherTimer = 0;
        }
        this._pomoStopTimer();
        if (this._caffeineTimer) {
            GLib.source_remove(this._caffeineTimer);
            this._caffeineTimer = 0;
        }
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }
        if (this._inhibitCookie)
            this._setCaffeine(false);
        this._soupSession?.abort();
        super.destroy();
    }
});

export default class SecondClockExtension extends Extension {
    enable() {
        this._indicator = new Indicator(this);
        // 'center' box + position 1 = immediately beside (after) the
        // built-in date/time, which sits at position 0 in the centre box.
        Main.panel.addToStatusArea(this.uuid, this._indicator, 1, 'center');
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
