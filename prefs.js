import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {FREQUENT_TOWNS} from './lib.js';

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
            description: 'From Open-Meteo (free, no account or API key). Choose a town from the list — or pick Custom… and type your own coordinates.',
        });
        wxPage.add(wxGroup);
        mkSwitch(wxGroup, 'Show weather', 'show-weather');
        mkSwitch(wxGroup, 'Use Fahrenheit (°F)', 'use-fahrenheit');

        const townNames = FREQUENT_TOWNS.map(t => t[0]);
        const townModel = new Gtk.StringList();
        townNames.forEach(n => townModel.append(n));
        townModel.append('Custom…');
        const townRow = new Adw.ComboRow({title: 'Town', model: townModel});
        wxGroup.add(townRow);

        const customGroup = new Adw.PreferencesGroup({
            title: 'Custom town',
            description: 'Used only when the town is set to Custom…',
        });
        wxPage.add(customGroup);
        const wxLabel = new Adw.EntryRow({title: 'Place name'});
        settings.bind('weather-label', wxLabel, 'text', Gio.SettingsBindFlags.DEFAULT);
        customGroup.add(wxLabel);

        const wxLat = new Adw.EntryRow({title: 'Latitude (e.g. -37.814 for Melbourne, 6.927 for Colombo)'});
        settings.bind('weather-lat', wxLat, 'text', Gio.SettingsBindFlags.DEFAULT);
        customGroup.add(wxLat);

        const wxLon = new Adw.EntryRow({title: 'Longitude (e.g. 144.963, 79.861)'});
        settings.bind('weather-lon', wxLon, 'text', Gio.SettingsBindFlags.DEFAULT);
        customGroup.add(wxLon);

        const syncTownRow = () => {
            const current = settings.get_string('weather-label');
            const idx = townNames.indexOf(current);
            townRow.selected = idx >= 0 ? idx : townNames.length; // Custom…
            customGroup.visible = idx < 0;
        };
        townRow.connect('notify::selected', () => {
            if (townRow.selected < townNames.length) {
                const [name, lat, lon] = FREQUENT_TOWNS[townRow.selected];
                settings.set_string('weather-label', name);
                settings.set_string('weather-lat', lat.toFixed(3));
                settings.set_string('weather-lon', lon.toFixed(3));
            }
            customGroup.visible = townRow.selected >= townNames.length;
        });
        syncTownRow();

        const wxRefreshGroup = new Adw.PreferencesGroup({title: 'Updates'});
        wxPage.add(wxRefreshGroup);
        mkSpin(wxRefreshGroup, 'Refresh every (minutes)', 'weather-refresh', 10, 120, 5);

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

        const addRow = new Adw.ActionRow({
            title: 'Save these lengths as a favourite',
            subtitle: 'Uses the work and break lengths set above',
        });
        const addBtn = new Gtk.Button({
            label: 'Add to favourites',
            icon_name: 'list-add-symbolic',
            valign: Gtk.Align.CENTER,
        });
        addRow.add_suffix(addBtn);
        addRow.activatable_widget = addBtn;
        pomoGroup.add(addRow);

        const favGroup = new Adw.PreferencesGroup({
            title: 'Favourites',
            description: 'Shown as quick buttons in the panel menu. The trash button deletes a favourite.',
        });
        pomoPage.add(favGroup);

        const getFavourites = () =>
            settings.get_value('pomodoro-favourites').deep_unpack();
        const setFavourites = list =>
            settings.set_value('pomodoro-favourites', new GLib.Variant('a(ii)', list));

        let favRows = [];
        const rebuildFavourites = () => {
            for (const row of favRows)
                favGroup.remove(row);
            favRows = [];
            const favourites = getFavourites();
            if (favourites.length === 0) {
                const empty = new Adw.ActionRow({
                    title: 'No favourites yet',
                    subtitle: 'Set the lengths above and press “Add to favourites”',
                });
                favGroup.add(empty);
                favRows.push(empty);
                return;
            }
            favourites.forEach(([work, brk], index) => {
                const row = new Adw.ActionRow({
                    title: `${work} min work · ${brk} min break`,
                });
                const delBtn = new Gtk.Button({
                    icon_name: 'user-trash-symbolic',
                    valign: Gtk.Align.CENTER,
                    tooltip_text: 'Delete this favourite',
                });
                delBtn.add_css_class('destructive-action');
                delBtn.add_css_class('flat');
                delBtn.connect('clicked', () => {
                    const list = getFavourites();
                    list.splice(index, 1);
                    setFavourites(list);
                });
                row.add_prefix(delBtn);
                favGroup.add(row);
                favRows.push(row);
            });
        };
        rebuildFavourites();
        settings.connect('changed::pomodoro-favourites', rebuildFavourites);

        addBtn.connect('clicked', () => {
            const pair = [settings.get_int('pomodoro-work'), settings.get_int('pomodoro-break')];
            const list = getFavourites();
            if (!list.some(([w, b]) => w === pair[0] && b === pair[1])) {
                list.push(pair);
                setFavourites(list);
            }
        });

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
