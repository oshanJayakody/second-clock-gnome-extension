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

        const page = new Adw.PreferencesPage({
            title: 'Second Clock',
            icon_name: 'preferences-system-time-symbolic',
        });
        window.add(page);

        // --- Clock ---
        const group = new Adw.PreferencesGroup({
            title: 'Clock timezone',
            description: 'Pick a preset, or type any IANA timezone below (e.g. Asia/Colombo). The clock updates once a minute — no seconds, to save power.',
        });
        page.add(group);

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
        page.add(fmtGroup);
        const mkSwitch = (parent, title, key) => {
            const row = new Adw.SwitchRow({title});
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            parent.add(row);
        };
        mkSwitch(fmtGroup, 'Show label', 'show-label');
        mkSwitch(fmtGroup, '24-hour time', 'use-24h');
        mkSwitch(fmtGroup, 'Show date', 'show-date');

        // --- Weather ---
        const wxGroup = new Adw.PreferencesGroup({
            title: 'Weather',
            description: 'From Open-Meteo (free, no account or API key). Pick a place in the panel menu, or type coordinates here.',
        });
        page.add(wxGroup);
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

        const wxRefresh = new Adw.SpinRow({
            title: 'Refresh every (minutes)',
            adjustment: new Gtk.Adjustment({lower: 10, upper: 120, step_increment: 5}),
        });
        settings.bind('weather-refresh', wxRefresh, 'value', Gio.SettingsBindFlags.DEFAULT);
        wxGroup.add(wxRefresh);

        // --- Pomodoro ---
        const pomoGroup = new Adw.PreferencesGroup({title: 'Pomodoro'});
        page.add(pomoGroup);
        const workRow = new Adw.SpinRow({
            title: 'Work length (minutes)',
            adjustment: new Gtk.Adjustment({lower: 1, upper: 180, step_increment: 1}),
        });
        settings.bind('pomodoro-work', workRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        pomoGroup.add(workRow);

        const breakRow = new Adw.SpinRow({
            title: 'Break length (minutes)',
            adjustment: new Gtk.Adjustment({lower: 1, upper: 60, step_increment: 1}),
        });
        settings.bind('pomodoro-break', breakRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        pomoGroup.add(breakRow);
    }
}
