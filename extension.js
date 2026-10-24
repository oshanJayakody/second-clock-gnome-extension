// Second Clock — shows another timezone beside GNOME's built-in clock.
// Placed in the centre box of the panel, immediately after the date menu.

import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const QUICK_ZONES = [
    ['Sri Lanka', 'Asia/Colombo'],
    ['Melbourne / Sydney', 'Australia/Melbourne'],
    ['Dubai', 'Asia/Dubai'],
    ['Singapore', 'Asia/Singapore'],
    ['London', 'Europe/London'],
    ['New York', 'America/New_York'],
    ['Los Angeles', 'America/Los_Angeles'],
    ['Tokyo', 'Asia/Tokyo'],
];

function makeTimeZone(identifier) {
    try {
        // GLib >= 2.68
        return GLib.TimeZone.new_identifier(identifier);
    } catch {
        try {
            return GLib.TimeZone.new(identifier);
        } catch {
            return null;
        }
    }
}

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.5, 'Second Clock', false);
        this._extension = extension;
        this._settings = extension.getSettings();
        this._timer = 0;

        this._label = new St.Label({
            text: '',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'second-clock-label',
        });
        this.add_child(this._label);

        this._fullItem = new PopupMenu.PopupMenuItem('', {reactive: false});
        this._localItem = new PopupMenu.PopupMenuItem('', {reactive: false});
        this._diffItem = new PopupMenu.PopupMenuItem('', {reactive: false});
        this.menu.addMenuItem(this._fullItem);
        this.menu.addMenuItem(this._localItem);
        this.menu.addMenuItem(this._diffItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

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

        const prefsItem = new PopupMenu.PopupMenuItem('Settings…');
        prefsItem.connect('activate', () => this._extension.openPreferences());
        this.menu.addMenuItem(prefsItem);

        this._settingsChangedId = this._settings.connect('changed', () => this._tick());
        this._tick();
        this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            this._tick();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _tick() {
        const tzId = this._settings.get_string('timezone') || 'Asia/Colombo';
        const tz = makeTimeZone(tzId);
        const now = tz ? GLib.DateTime.new_now(tz) : GLib.DateTime.new_now_local();
        const local = GLib.DateTime.new_now_local();

        const use24h = this._settings.get_boolean('use-24h');
        const showSeconds = this._settings.get_boolean('show-seconds');
        let fmt = use24h ? '%H:%M' : '%I:%M %p';
        if (showSeconds)
            fmt = use24h ? '%H:%M:%S' : '%I:%M:%S %p';
        if (this._settings.get_boolean('show-date'))
            fmt = `%a %d %b ${fmt}`;

        const timeText = now.format(fmt) ?? '';
        const label = this._settings.get_boolean('show-label')
            ? this._settings.get_string('label').trim() : '';
        this._label.text = label ? `${label}  ${timeText}` : timeText;

        // Menu details
        this._fullItem.label.text = `${label || tzId}:  ${now.format('%A, %d %B %Y, %H:%M:%S')}`;
        this._localItem.label.text = `Local:  ${local.format('%A, %d %B %Y, %H:%M:%S')} (${local.get_timezone_abbreviation()})`;

        const diffSeconds = now.get_utc_offset() - local.get_utc_offset();
        const diffHours = diffSeconds / 3600000000; // microseconds -> hours
        const abs = Math.abs(diffHours);
        const hrs = Number.isInteger(abs) ? `${abs}` : abs.toFixed(1);
        this._diffItem.label.text = diffHours === 0
            ? 'Same time as local right now'
            : `${label || tzId} is ${hrs}h ${diffHours > 0 ? 'ahead of' : 'behind'} local time`;
    }

    destroy() {
        if (this._timer) {
            GLib.source_remove(this._timer);
            this._timer = 0;
        }
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }
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
