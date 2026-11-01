// Shared helpers for Second Clock.

import GLib from 'gi://GLib';

export const QUICK_ZONES = [
    ['Sri Lanka', 'Asia/Colombo'],
    ['Melbourne / Sydney', 'Australia/Melbourne'],
    ['Dubai', 'Asia/Dubai'],
    ['Singapore', 'Asia/Singapore'],
    ['London', 'Europe/London'],
    ['New York', 'America/New_York'],
    ['Los Angeles', 'America/Los_Angeles'],
    ['Tokyo', 'Asia/Tokyo'],
];

export const WEATHER_PLACES = [
    ['Melbourne', '-37.814', '144.963'],
    ['Colombo', '6.927', '79.861'],
    ['Sydney', '-33.869', '151.209'],
    ['London', '51.507', '-0.128'],
    ['Dubai', '25.205', '55.271'],
    ['Singapore', '1.352', '103.820'],
];

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
