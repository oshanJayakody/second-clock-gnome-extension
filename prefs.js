import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const ZONES = [
    'Asia/Colombo',
    'Australia/Melbourne',
    'Australia/Sydney',
    'Australia/Perth',
    'Asia/Dubai',
    'Asia/Singapore',
    'Asia/Kolkata',
    'Asia/Tokyo',
    'Europe/London',
    'Europe/Paris',
    'America/New_York',
    'America/Los_Angeles',
    'Pacific/Auckland',
];

export default class SecondClockPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const mkSwitch = (parent, title, key) => {
            const row = new Adw.SwitchRow({title});
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            parent.add(row);
        };
        const mkSpin = (parent, title, key, lower, upper, step) => {
            const row = new Adw.SpinRow({
                title,
                adjustment: new Gtk.Adjustment({lower, upper, step_increment: step}),
            });
            settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
            parent.add(row);
        };

        // ================= Clock tab =================
        const clockPage = new Adw.PreferencesPage({
            title: 'Clock',
            icon_name: 'preferences-system-time-symbolic',
        });
        window.add(clockPage);

        const group = new Adw.PreferencesGroup({
            title: 'Clock timezone',
            description: 'Pick a preset, or type any IANA timezone below (e.g. Asia/Colombo). The clock updates once a minute — no seconds, to save power.',
        });
        clockPage.add(group);

        const model = new Gtk.StringList();
        ZONES.forEach(z => model.append(z));
        const zoneRow = new Adw.ComboRow({title: 'Preset timezone', model});
        const idx = ZONES.indexOf(settings.get_string('timezone'));
        if (idx >= 0)
            zoneRow.selected = idx;
        zoneRow.connect('notify::selected', () => {
            const z = ZONES[zoneRow.selected];
            if (z)
                settings.set_string('timezone', z);
        });
        group.add(zoneRow);

        const tzEntry = new Adw.EntryRow({title: 'Timezone (IANA)'});
        settings.bind('timezone', tzEntry, 'text', Gio.SettingsBindFlags.DEFAULT);
        group.add(tzEntry);

        const labelEntry = new Adw.EntryRow({title: 'Label'});
        settings.bind('label', labelEntry, 'text', Gio.SettingsBindFlags.DEFAULT);
        group.add(labelEntry);

        const fmtGroup = new Adw.PreferencesGroup({title: 'Clock format'});
        clockPage.add(fmtGroup);
        mkSwitch(fmtGroup, 'Show label', 'show-label');
        mkSwitch(fmtGroup, '24-hour time', 'use-24h');
        mkSwitch(fmtGroup, 'Show date', 'show-date');

        // ================= Weather tab =================
        const wxPage = new Adw.PreferencesPage({
            title: 'Weather',
            icon_name: 'weather-few-clouds-symbolic',
        });
        window.add(wxPage);

        const wxGroup = new Adw.PreferencesGroup({
            title: 'Weather',
            description: 'From Open-Meteo (free, no account or API key). Pick a place in the panel menu, or type coordinates here.',
        });
        wxPage.add(wxGroup);
        mkSwitch(wxGroup, 'Show weather', 'show-weather');

        const wxLabel = new Adw.EntryRow({title: 'Place name'});
        settings.bind('weather-label', wxLabel, 'text', Gio.SettingsBindFlags.DEFAULT);
        wxGroup.add(wxLabel);

        const wxLat = new Adw.EntryRow({title: 'Latitude (e.g. -37.814 for Melbourne, 6.927 for Colombo)'});
        settings.bind('weather-lat', wxLat, 'text', Gio.SettingsBindFlags.DEFAULT);
        wxGroup.add(wxLat);

        const wxLon = new Adw.EntryRow({title: 'Longitude (e.g. 144.963, 79.861)'});
        settings.bind('weather-lon', wxLon, 'text', Gio.SettingsBindFlags.DEFAULT);
        wxGroup.add(wxLon);

        mkSpin(wxGroup, 'Refresh every (minutes)', 'weather-refresh', 10, 120, 5);

        // ================= Pomodoro tab =================
        const pomoPage = new Adw.PreferencesPage({
            title: 'Pomodoro',
            icon_name: 'alarm-symbolic',
        });
        window.add(pomoPage);

        const pomoGroup = new Adw.PreferencesGroup({
            title: 'Pomodoro',
            description: 'Start, pause and reset from the panel menu. You get a notification when a work session or break ends.',
        });
        pomoPage.add(pomoGroup);
        mkSpin(pomoGroup, 'Work length (minutes)', 'pomodoro-work', 1, 180, 1);
        mkSpin(pomoGroup, 'Break length (minutes)', 'pomodoro-break', 1, 60, 1);

        // ================= Caffeine tab =================
        const cafPage = new Adw.PreferencesPage({
            title: 'Caffeine',
            icon_name: 'emoji-food-beverage-symbolic',
        });
        window.add(cafPage);

        const cafGroup = new Adw.PreferencesGroup({
            title: 'Caffeine',
            description: 'Keeps the screen and system awake (inhibits suspend and idle) while the switch in the panel menu is on.',
        });
        cafPage.add(cafGroup);
        mkSwitch(cafGroup, 'Turn on when the extension starts', 'caffeine-on-start');
        mkSwitch(cafGroup, 'Show ☕ in the panel while on', 'show-caffeine-icon');
        mkSpin(cafGroup, 'Auto-off after (minutes, 0 = never)', 'caffeine-duration', 0, 480, 5);
    }
}
