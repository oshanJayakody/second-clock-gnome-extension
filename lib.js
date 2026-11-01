// Shared helpers for Second Clock.

import GLib from 'gi://GLib';

export const FREQUENT_TOWNS = [
    ['Melbourne', -37.814, 144.963],
    ['Sydney', -33.869, 151.209],
    ['Brisbane', -27.470, 153.026],
    ['Perth', -31.952, 115.857],
    ['Adelaide', -34.929, 138.600],
    ['Canberra', -35.281, 149.130],
    ['Hobart', -42.882, 147.327],
    ['Darwin', -12.463, 130.844],
    ['Colombo', 6.927, 79.861],
    ['Kandy', 7.291, 80.637],
    ['Galle', 6.053, 80.221],
    ['Singapore', 1.352, 103.820],
    ['Kuala Lumpur', 3.139, 101.687],
    ['Bangkok', 13.756, 100.502],
    ['Dubai', 25.205, 55.271],
    ['Tokyo', 35.677, 139.763],
    ['London', 51.507, -0.128],
    ['New York', 40.713, -74.006],
    ['Auckland', -36.849, 174.763],
];

export function convertTemp(celsius, useFahrenheit) {
    return Math.round(useFahrenheit ? celsius * 9 / 5 + 32 : celsius);
}

export function tempUnit(useFahrenheit) {
    return useFahrenheit ? '°F' : '°C';
}

export function makeTimeZone(identifier) {
    try {
        return GLib.TimeZone.new_identifier(identifier);
    } catch {
        try {
            return GLib.TimeZone.new(identifier);
        } catch {
            return null;
        }
    }
}

export function weatherInfo(code) {
    // WMO weather codes -> [description, short symbol]
    if (code === 0) return ['Clear sky', '☀'];
    if (code === 1 || code === 2) return ['Partly cloudy', '⛅'];
    if (code === 3) return ['Overcast', '☁'];
    if (code === 45 || code === 48) return ['Fog', '🌫'];
    if (code >= 51 && code <= 57) return ['Drizzle', '🌦'];
    if (code >= 61 && code <= 67) return ['Rain', '🌧'];
    if (code >= 71 && code <= 77) return ['Snow', '❄'];
    if (code >= 80 && code <= 82) return ['Rain showers', '🌦'];
    if (code === 85 || code === 86) return ['Snow showers', '❄'];
    if (code >= 95) return ['Thunderstorm', '⛈'];
    return ['—', ''];
}

export function weatherIconName(code) {
    // WMO weather codes -> symbolic icon names (Adwaita / GNOME weather icons)
    if (code === 0) return 'weather-clear-symbolic';
    if (code === 1 || code === 2) return 'weather-few-clouds-symbolic';
    if (code === 3) return 'weather-overcast-symbolic';
    if (code === 45 || code === 48) return 'weather-fog-symbolic';
    if (code >= 51 && code <= 57) return 'weather-showers-scattered-symbolic';
    if (code >= 61 && code <= 67) return 'weather-showers-symbolic';
    if (code >= 71 && code <= 77) return 'weather-snow-symbolic';
    if (code >= 80 && code <= 82) return 'weather-showers-scattered-symbolic';
    if (code === 85 || code === 86) return 'weather-snow-symbolic';
    if (code >= 95) return 'weather-storm-symbolic';
    return 'weather-few-clouds-symbolic';
}

export function fmtCountdown(totalSeconds) {
    const s = Math.max(0, Math.round(totalSeconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}
