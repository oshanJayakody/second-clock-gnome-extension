// Second Clock + Weather + Pomodoro + Caffeine
// A second timezone clock in the centre of the top panel, beside GNOME's
// built-in date and time. The clock updates once per minute (aligned to the
// minute boundary) — no seconds anywhere, so it costs almost no power.
// The dropdown is styled like GNOME's calendar widgets: dark section cards
// (World Clock card, Weather card with an hourly strip, Pomodoro, Caffeine).
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

import {makeTimeZone, weatherInfo, weatherIconName, fmtCountdown, convertTemp, tempUnit} from './lib.js';

function hourLabel(isoTime) {
    const h = parseInt(isoTime.slice(11, 13), 10);
    if (!Number.isFinite(h)) return '';
    return `${((h + 11) % 12) + 1}:00`;
}

function diffLabel(diffHours) {
    const totalMinutes = Math.round(Math.abs(diffHours) * 60);
    const hh = Math.floor(totalMinutes / 60);
    const mm = totalMinutes % 60;
    const sign = diffHours > 0 ? '+' : diffHours < 0 ? '-' : '';
    return `${sign}${hh}:${String(mm).padStart(2, '0')}`;
}

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.5, 'Second Clock', false);
        this._extension = extension;
        this._settings = extension.getSettings();

        // Theme: pill in the panel + widget-card menu (see stylesheet.css)
        this.add_style_class_name('second-clock-button');
        this.menu.actor.add_style_class_name('second-clock-menu');

        this._clockTimer = 0;
        this._weatherTimer = 0;
        this._weather = null;
        this._weatherFetchedAt = 0;
        this._soupSession = new Soup.Session();
        this._inhibitCookie = 0;
        this._caffeineTimer = 0;

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

    // A GNOME-calendar-style section card with a bold title header.
    _card(title) {
        const item = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            style_class: 'second-clock-card',
        });
        const box = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true});
        const header = new St.BoxLayout({x_expand: true});
        const titleLabel = new St.Label({text: title, style_class: 'sc-card-title'});
        const rightLabel = new St.Label({
            text: '',
            style_class: 'sc-card-right',
            x_expand: true,
            x_align: Clutter.ActorAlign.END,
        });
        header.add_child(titleLabel);
        header.add_child(rightLabel);
        box.add_child(header);
        item.add_child(box);
        return {item, box, rightLabel};
    }

    _buildMenu() {
        // ---- World Clock card ----
        const clock = this._card('World Clock');
        this._clockDiffLabel = clock.rightLabel;

        const clockRow = new St.BoxLayout({x_expand: true, style_class: 'sc-card-row'});
        this._clockPlaceLabel = new St.Label({text: '', style_class: 'sc-place'});
        this._clockTimeLabel = new St.Label({
            text: '',
            style_class: 'sc-bigtime',
            x_expand: true,
            x_align: Clutter.ActorAlign.END,
        });
        clockRow.add_child(this._clockPlaceLabel);
        clockRow.add_child(this._clockTimeLabel);
        clock.box.add_child(clockRow);

        this._clockDateLabel = new St.Label({text: '', style_class: 'sc-muted'});
        clock.box.add_child(this._clockDateLabel);
        this._clockLocalLabel = new St.Label({text: '', style_class: 'sc-muted'});
        clock.box.add_child(this._clockLocalLabel);
        this.menu.addMenuItem(clock.item);
        // Note: timezone and weather location are changed in Settings only.

        // ---- Weather card ----
        const wx = this._card('Weather');
        this._wxPlaceLabel = wx.rightLabel;
        this._wxStatusLabel = new St.Label({text: '…', style_class: 'sc-muted'});
        wx.box.add_child(this._wxStatusLabel);
        this._wxHoursBox = new St.BoxLayout({x_expand: true, style_class: 'sc-hours'});
        wx.box.add_child(this._wxHoursBox);
        this._wxFooterLabel = new St.Label({text: '', style_class: 'sc-muted'});
        wx.box.add_child(this._wxFooterLabel);
        this.menu.addMenuItem(wx.item);

        const refreshItem = new PopupMenu.PopupMenuItem('Refresh weather now');
        refreshItem.connect('activate', () => this._fetchWeather());
        this.menu.addMenuItem(refreshItem);

        // ---- Pomodoro card ----
        const pomo = this._card('Pomodoro');
        this._pomoSessionsLabel = pomo.rightLabel;
        const pomoRow = new St.BoxLayout({x_expand: true, style_class: 'sc-card-row'});
        this._pomoPhaseLabel = new St.Label({text: '', style_class: 'sc-place'});
        this._pomoTimeLabel = new St.Label({
            text: '',
            style_class: 'sc-bigtime',
            x_expand: true,
            x_align: Clutter.ActorAlign.END,
        });
        pomoRow.add_child(this._pomoPhaseLabel);
        pomoRow.add_child(this._pomoTimeLabel);
        pomo.box.add_child(pomoRow);
        this._pomoStatusLabel = new St.Label({text: '', style_class: 'sc-muted'});
        pomo.box.add_child(this._pomoStatusLabel);

        // Small buttons in a single row: play/pause, reset, length presets
        const btnRow = new St.BoxLayout({style_class: 'sc-pomo-row', x_expand: true});

        this._pomoPlayBtn = new St.Button({style_class: 'sc-pomo-btn'});
        const playBox = new St.BoxLayout();
        this._pomoPlayIcon = new St.Icon({icon_name: 'media-playback-start-symbolic', icon_size: 14});
        this._pomoPlayLabel = new St.Label({text: 'Start', style_class: 'sc-btn-label'});
        playBox.add_child(this._pomoPlayIcon);
        playBox.add_child(this._pomoPlayLabel);
        this._pomoPlayBtn.set_child(playBox);
        this._pomoPlayBtn.connect('clicked', () => this._pomoToggle());
        btnRow.add_child(this._pomoPlayBtn);

        const resetBtn = new St.Button({
            style_class: 'sc-pomo-btn',
            child: new St.Icon({icon_name: 'view-refresh-symbolic', icon_size: 14}),
        });
        resetBtn.connect('clicked', () => this._pomoReset());
        btnRow.add_child(resetBtn);

        this._favBox = new St.BoxLayout({style_class: 'sc-fav-box'});
        this._favSignature = null;
        btnRow.add_child(this._favBox);
        this._rebuildFavButtons();
        pomo.box.add_child(btnRow);
        this.menu.addMenuItem(pomo.item);

        // ---- Caffeine card (switch row) ----
        this._caffeineItem = new PopupMenu.PopupSwitchMenuItem('Caffeine — stay awake', false);
        this._caffeineItem.add_style_class_name('second-clock-card');
        this._caffeineItem.add_style_class_name('sc-caffeine');
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

        const placeName = label || tzId.split('/').pop().replace(/_/g, ' ');
        this._clockPlaceLabel.text = placeName;
        this._clockTimeLabel.text = now.format(fmt) ?? '';
        this._clockDateLabel.text = now.format('%A, %d %B %Y');

        const diffHours = (now.get_utc_offset() - local.get_utc_offset()) / 3600000000;
        this._clockDiffLabel.text = diffLabel(diffHours);
        this._clockLocalLabel.text = `Local ${local.format(fmt)} (${local.get_timezone_abbreviation()})`;
    }

    _scheduleClockTimer() {
        if (this._clockTimer) {
            GLib.source_remove(this._clockTimer);
            this._clockTimer = 0;
        }
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
            this._weather = null;
            this._wxStatusLabel.text = 'Set a valid location in Settings';
            return;
        }
        const url = 'https://api.open-meteo.com/v1/forecast' +
            `?latitude=${lat}&longitude=${lon}` +
            '&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m' +
            '&hourly=temperature_2m,weather_code' +
            '&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=2';
        const message = Soup.Message.new('GET', url);
        this._soupSession.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (session, result) => {
            try {
                const bytes = session.send_and_read_finish(result);
                const data = JSON.parse(new TextDecoder().decode(bytes.get_data()));
                const cur = data.current;
                const [desc, symbol] = weatherInfo(cur.weather_code);

                let hourly = [];
                const times = data.hourly?.time ?? [];
                const targetHour = (cur.time ?? '').slice(0, 13);
                let idx = times.findIndex(t => t.slice(0, 13) === targetHour);
                if (idx < 0) idx = 0;
                for (let i = idx; i < Math.min(idx + 5, times.length); i++) {
                    hourly.push({
                        label: hourLabel(times[i]),
                        icon: weatherIconName(data.hourly.weather_code[i]),
                        temp: Math.round(data.hourly.temperature_2m[i]),
                    });
                }

                this._weather = {
                    temp: Math.round(cur.temperature_2m),
                    desc,
                    symbol,
                    humidity: cur.relative_humidity_2m,
                    wind: Math.round(cur.wind_speed_10m),
                    max: Math.round(data.daily.temperature_2m_max[0]),
                    min: Math.round(data.daily.temperature_2m_min[0]),
                    hourly,
                };
                this._weatherFetchedAt = Date.now();
            } catch (e) {
                this._weather = null;
                this._wxStatusLabel.text = 'Weather unavailable (offline?)';
                this._wxHoursBox.remove_all_children();
                this._wxFooterLabel.text = '';
            }
            this._render();
        });
    }

    _renderWeather() {
        this._wxPlaceLabel.text = this._settings.get_string('weather-label') || '';
        if (!this._settings.get_boolean('show-weather')) {
            this._wxStatusLabel.text = 'Off — enable it in Settings, Weather tab';
            this._wxHoursBox.remove_all_children();
            this._wxFooterLabel.text = '';
            return;
        }
        if (!this._weather)
            return; // keep the "…" / error text set elsewhere

        const useF = this._settings.get_boolean('use-fahrenheit');
        this._wxStatusLabel.text = `${this._weather.desc} · now ${convertTemp(this._weather.temp, useF)}${tempUnit(useF)}`;
        this._wxHoursBox.remove_all_children();
        for (const hour of this._weather.hourly) {
            const col = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: 'sc-hour-col'});
            const time = new St.Label({text: hour.label, style_class: 'sc-hour-time', x_align: Clutter.ActorAlign.CENTER});
            const icon = new St.Icon({icon_name: hour.icon, icon_size: 26, style_class: 'sc-hour-icon', x_align: Clutter.ActorAlign.CENTER});
            const temp = new St.Label({text: `${convertTemp(hour.temp, useF)}°`, style_class: 'sc-hour-temp', x_align: Clutter.ActorAlign.CENTER});
            col.add_child(time);
            col.add_child(icon);
            col.add_child(temp);
            this._wxHoursBox.add_child(col);
        }
        this._wxFooterLabel.text = `Today ${convertTemp(this._weather.min, useF)}°–${convertTemp(this._weather.max, useF)}° · Humidity ${this._weather.humidity}% · Wind ${this._weather.wind} km/h`;
    }

    _rebuildFavButtons() {
        const favourites = this._settings.get_value('pomodoro-favourites').deep_unpack();
        const signature = JSON.stringify(favourites);
        if (signature === this._favSignature)
            return;
        this._favSignature = signature;
        this._favBox.remove_all_children();
        for (const [work, brk] of favourites) {
            // Widget shows only the full work time as text — no break time.
            const btn = new St.Button({label: `${work} min`, style_class: 'sc-pomo-btn'});
            btn.connect('clicked', () => {
                this._settings.set_int('pomodoro-work', work);
                this._settings.set_int('pomodoro-break', brk);
                this._pomoReset();
            });
            this._favBox.add_child(btn);
        }
    }

    // ---------- Pomodoro ----------
    _pomoToggle() {
        if (this._pomo.phase === 'idle') {
            this._pomo.phase = 'work';
            this._pomo.remaining = this._settings.get_int('pomodoro-work') * 60;
            this._pomoStart();
        } else if (this._pomo.running) {
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

    // ---------- Rendering ----------
    _render() {
        const parts = [];
        const label = this._clockLabel ?? '';
        parts.push(label ? `${label}  ${this._clockText ?? ''}` : (this._clockText ?? ''));

        if (this._settings.get_boolean('show-weather') && this._weather) {
            const useF = this._settings.get_boolean('use-fahrenheit');
            parts.push(`${this._weather.symbol} ${convertTemp(this._weather.temp, useF)}${tempUnit(useF)}`);
        }

        if (this._pomo.phase !== 'idle')
            parts.push(`⏱ ${fmtCountdown(this._pomo.remaining)}`);

        if (this._inhibitCookie && this._settings.get_boolean('show-caffeine-icon'))
            parts.push('☕');

        this._label.text = parts.join('   ');

        this._renderWeather();

        // Pomodoro card
        this._pomoSessionsLabel.text = this._pomo.sessions ? `${this._pomo.sessions} done` : '';
        this._rebuildFavButtons();

        if (this._pomo.phase === 'idle') {
            this._pomoPhaseLabel.text = 'Ready';
            this._pomoTimeLabel.text = fmtCountdown(this._settings.get_int('pomodoro-work') * 60);
            this._pomoStatusLabel.text = `${this._settings.get_int('pomodoro-work')} min`;
            this._pomoPlayIcon.icon_name = 'media-playback-start-symbolic';
            this._pomoPlayLabel.text = 'Start';
        } else {
            this._pomoPhaseLabel.text = this._pomo.phase === 'work' ? 'Work' : 'Break';
            this._pomoTimeLabel.text = fmtCountdown(this._pomo.remaining);
            this._pomoStatusLabel.text = this._pomo.running ? 'Running…' : 'Paused';
            this._pomoPlayIcon.icon_name = this._pomo.running
                ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
            this._pomoPlayLabel.text = this._pomo.running ? 'Pause' : 'Resume';
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
