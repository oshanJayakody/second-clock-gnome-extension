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

        const group = new Adw.PreferencesGroup({
            title: 'Timezone',
            description: 'Pick a preset, or type any IANA timezone below (e.g. Asia/Colombo).',
        });
        page.add(group);

        const model = new Gtk.StringList();
        ZONES.forEach(z => model.append(z));
        const zoneRow = new Adw.ComboRow({
            title: 'Preset timezone',
            model,
        });
        const current = settings.get_string('timezone');
        const idx = ZONES.indexOf(current);
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

        const fmtGroup = new Adw.PreferencesGroup({title: 'Format'});
        page.add(fmtGroup);

        const mkSwitch = (title, key) => {
            const row = new Adw.SwitchRow({title});
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            fmtGroup.add(row);
        };
        mkSwitch('Show label', 'show-label');
        mkSwitch('24-hour time', 'use-24h');
        mkSwitch('Show seconds', 'show-seconds');
        mkSwitch('Show date', 'show-date');
    }
}
