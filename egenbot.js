// ====================== ОСНОВНЫЕ ПЕРЕМЕННЫЕ ======================
const chat = document.getElementById('chat');
const input = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const themeToggle = document.getElementById('themeToggle');
const myPositionBtn = document.getElementById('myPositionBtn');

let isProcessing = false;
let lastMessageTime = 0;
const MESSAGE_COOLDOWN = 800;

// ====================== TEMA ======================
function toggleTheme() {
    document.body.classList.toggle('light');
    const isLight = document.body.classList.contains('light');
    themeToggle.textContent = isLight ? '🌙' : '☀️';
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
}

// ====================== HJELPEFUNKSJONER ======================
function addMessage(text, isUser = false) {
    const div = document.createElement('div');
    div.className = `message ${isUser ? 'user' : 'bot'}`;
    div.innerHTML = isUser ? text : text.replace(/\n/g, '<br>');
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

function showTyping() {
    const t = document.createElement('div');
    t.id = 'typing';
    t.className = 'typing';
    t.innerHTML = `<div class="dot"></div><div class="dot"></div><div class="dot"></div>`;
    chat.appendChild(t);
    chat.scrollTop = chat.scrollHeight;
    return t;
}

async function typeMessage(text) {
    const typing = showTyping();
    await new Promise(r => setTimeout(r, 300));
    typing.remove();

    const msg = document.createElement('div');
    msg.className = 'message bot';
    chat.appendChild(msg);

    let i = 0;
    return new Promise(resolve => {
        function type() {
            if (i < text.length) {
                msg.innerHTML += text[i] === '\n' ? '<br>' : text[i];
                i++;
                chat.scrollTop = chat.scrollHeight;
                setTimeout(type, 15);
            } else resolve();
        }
        type();
    });
}

// ====================== SPAM-BESKYTTELSE ======================
function canSendMessage() {
    const now = Date.now();
    if (isProcessing || (now - lastMessageTime < MESSAGE_COOLDOWN)) return false;
    lastMessageTime = now;
    return true;
}

// ====================== GEOLOKASJON ======================
async function getPlaceName(lat, lon) {
    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`,
            { headers: { 'User-Agent': 'RomanChatbot/1.0', 'Accept-Language': 'no' } }
        );
        const data = await res.json();

        let city = data.address?.city || data.address?.town || data.address?.village || 
                   data.address?.municipality || "ukjent sted";
        let region = data.address?.county || "";

        const regionFix = {
            "Акерсхус": "Akershus", "Осло": "Oslo", "Вестфолл": "Vestfold",
            "Телемарк": "Telemark", "Вестланд": "Vestland", "Ругаланн": "Rogaland",
            "Тренделаг": "Trøndelag", "Нурланн": "Nordland", "Тромс": "Troms",
            "Финнмарк": "Finnmark", "Иннландет": "Innlandet", "Мёре ог Ромсдал": "Møre og Romsdal",
            "Агдер": "Agder", "Викен": "Viken"
        };
        if (regionFix[region]) region = regionFix[region];

        const fullName = region ? `${city}, ${region}` : city;
        return { fullName };
    } catch (e) {
        return { fullName: "Din posisjon" };
    }
}

async function getMyPosition() {
    if (isProcessing) return;
    isProcessing = true;
    addMessage("📍 Henter posisjonen din...", false);

    if (!navigator.geolocation) {
        addMessage("Beklager, din nettleser støtter ikke geolokasjon.", false);
        isProcessing = false;
        return;
    }

    const typing = showTyping();

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            typing.remove();
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            const place = await getPlaceName(lat, lon);
            const cityName = place.fullName;

            const timeText = getTimeInCity(cityName);
            const weatherText = await getWeather(lat, lon, cityName);

            const info = `📍 Du er nær **${cityName}**.\n`;
            await typeMessage(info + '\n' + timeText + '\n\n' + weatherText);
            isProcessing = false;
        },
        (error) => {
            typing.remove();
            let msg = "Kunne ikke hente posisjonen din.";
            if (error.code === 1) msg = "Du har nektet tilgang til posisjon. Vennligst tillat det.";
            if (error.code === 2) msg = "Posisjon er ikke tilgjengelig.";
            if (error.code === 3) msg = "Tidsavbrudd.";
            addMessage(msg, false);
            isProcessing = false;
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
}

// ====================== TID ======================
function getTimeInCity(cityName) {
    const timeStr = new Intl.DateTimeFormat('no-NO', {
        timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date());

    const dateStr = new Intl.DateTimeFormat('no-NO', {
        timeZone: 'Europe/Oslo', weekday: 'long', day: 'numeric', month: 'long'
    }).format(new Date());

    return `🕒 **${cityName}**\nKlokken er nå: **${timeStr}**\n${dateStr}`;
}

// ====================== VÆR ======================
function getNorwegianCondition(symbolCode) {
    const map = {
        clearsky: "klarvær", fair: "pent vær", partlycloudy: "delvis skyet",
        cloudy: "overskyet", lightrain: "litt regn", rain: "regn",
        heavyrain: "kraftig regn", lightsnow: "litt snø", snow: "snø",
        heavysnow: "kraftig snø", sleet: "sludd", fog: "tåke"
    };
    const key = symbolCode ? symbolCode.split('_')[0] : '';
    return map[key] || symbolCode?.replace('_', ' ') || "ukjent vær";
}

async function getWeather(lat, lon, cityName) {
    try {
        const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`;
        const res = await fetch(url, { headers: { 'User-Agent': 'RomanChatbot/1.0 (contact@example.com)' } });
        const data = await res.json();
        const now = data.properties.timeseries[0].data.instant.details;
        const symbol = data.properties.timeseries[0].data.next_1_hours?.summary.symbol_code || '';

        const temp = Math.round(now.air_temperature);
        const wind = Math.round(now.wind_speed);
        const humidity = Math.round(now.relative_humidity);
        const condition = getNorwegianCondition(symbol);
        const emoji = temp < 0 ? '❄️' : temp > 15 ? '☀️' : '🌥️';

        return `🌤️ **${cityName}**\nTemperatur: **${temp}°C** ${emoji}\nVind: ${wind} m/s\nLuftfuktighet: ${humidity}%\nVær nå: ${condition}`;
    } catch (e) {
        return `Kunne ikke hente været for ${cityName}. Prøv igjen senere.`;
    }
}

// ====================== KOORDINATER ======================
async function getCoordinates(cityName) {
    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cityName)}, Norway&limit=1`,
            { headers: { 'User-Agent': 'RomanChatbot/1.0' } }
        );
        const data = await res.json();
        if (data && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lon: parseFloat(data[0].lon),
                name: data[0].display_name.split(',')[0]
            };
        }
        return null;
    } catch (e) {
        return null;
    }
}

// ====================== ПОЛЯРНОЕ СИЯНИЕ ======================
async function getAuroraForecast(cityName) {
    try {
        const coords = await getCoordinates(cityName);
        if (!coords) return `Jeg fant ikke stedet «${cityName}». Prøv et kjent sted i Nord-Norge.`;

        const { lat } = coords;

        const kpRes = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json');
        const kpData = await kpRes.json();
        const latestKp = parseFloat(kpData[kpData.length - 1][1]) || 2;

        let baseProb = 0;
        if (lat >= 70) baseProb = 85;
        else if (lat >= 68) baseProb = 75;
        else if (lat >= 65) baseProb = 55;
        else baseProb = 20;

        let kpFactor = 1;
        if (latestKp >= 5) kpFactor = 1.8;
        else if (latestKp >= 4) kpFactor = 1.5;
        else if (latestKp >= 3) kpFactor = 1.2;

        let probability = Math.min(95, Math.round(baseProb * kpFactor));

        const emoji = probability > 70 ? '🌟✨' : probability > 40 ? '🌠' : '🌌';

        return `🌌 **Polarlys (Aurora Borealis) i ${cityName}**\n\n` +
               `📍 Breddegrad: ca. ${lat.toFixed(1)}°N\n` +
               `🔢 Nåværende Kp-index: **${latestKp}**\n\n` +
               `${emoji} **Sjanse for å se polarlys i kveld/natt: ${probability}%**\n\n` +
               `Tips: Trenger klart vær og mørk himmel. Jo høyere Kp, jo bedre sjanse!\n` +
               `Nord-Norge (over 65°N) er best stedet.`;
    } catch (e) {
        console.error(e);
        return `Kunne ikke hente polarlys-informasjon akkurat nå. Prøv igjen senere.`;
    }
}

// ====================== AVSTAND ======================
async function getDistance(city1, city2) {
    const c1 = await getCoordinates(city1);
    const c2 = await getCoordinates(city2);
    if (!c1 || !c2) return null;

    const R = 6371;
    const dLat = (c2.lat - c1.lat) * Math.PI / 180;
    const dLon = (c2.lon - c1.lon) * Math.PI / 180;

    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(c1.lat * Math.PI / 180) * Math.cos(c2.lat * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = Math.round(R * c);

    return { distance, from: c1.name, to: c2.name };
}

// ====================== BUSSFORBINDELSER ======================
async function getBusConnection(fromCity, toCity) {
    try {
        const fromCoords = await getCoordinates(fromCity);
        const toCoords = await getCoordinates(toCity);

        if (!fromCoords || !toCoords) return null;

        const url = `https://api.entur.io/journey-planner/v3/trips?fromPlace=${fromCoords.lat},${fromCoords.lon}&toPlace=${toCoords.lat},${toCoords.lon}&searchDate=2026-04-09&searchTime=10:00&transportModes=bus`;

        const res = await fetch(url, {
            headers: { 'ET-Client-Name': 'RomanChatbot - personal use' }
        });

        const data = await res.json();

        if (data.tripPatterns && data.tripPatterns.length > 0) {
            const first = data.tripPatterns[0];
            const duration = Math.round(first.duration / 60);
            return `Det går buss fra ${fromCity} til ${toCity}. Reisetiden er ca. **${duration} minutter**.`;
        } else {
            return `Det finnes ingen direkte bussforbindelse fra ${fromCity} til ${toCity} akkurat nå.`;
        }
    } catch (e) {
        return `Kunne ikke hente bussinformasjon fra ${fromCity} til ${toCity}. Prøv igjen senere.`;
    }
}

// ====================== КУРСЫ ВАЛЮТ (ИСПРАВЛЕННАЯ) ======================
async function getCurrencyRate(msg) {
    try {
        let amount = 1;
        let baseCurrency = null;
        let targetCurrency = null;

        const upper = msg.toUpperCase();
        const words = upper.split(/\s+/);

        // Большой список поддерживаемых валют
        const supportedCurrencies = [
            'NOK','EUR','USD','GBP','SEK','DKK','CHF','PLN','CZK','HUK','RON','BGN','HRK','ISK',
            'UAH','RUB','TRY','CAD','AUD','NZD','JPY','CNY','HKD','SGD','KRW','INR','THB',
            'IDR','MYR','PHP','VND','AED','SAR','BRL','MXN','ZAR','TWD','ILS'
        ];

        // ===== ПАРСИНГ СООБЩЕНИЯ =====
        // Формат 1: "100 EUR to USD"
        // Формат 2: "100 EUR USD"
        // Формат 3: "EUR to USD" (по умолчанию 1)
        // Формат 4: "Valuta EUR" (по умолчанию к NOK)

        // Ищем число в начале
        const numberMatch = msg.match(/^\d+[\.,]?\d*/);
        if (numberMatch) {
            amount = parseFloat(numberMatch[0].replace(',', '.'));
        }

        // Ищем все валюты в сообщении
        const currencyMatches = [];
        const currencyRegex = /\b([A-Z]{3})\b/g;
        let match;
        while ((match = currencyRegex.exec(upper)) !== null) {
            const curr = match[1];
            if (supportedCurrencies.includes(curr) && !currencyMatches.includes(curr)) {
                currencyMatches.push(curr);
            }
        }

        // Если найдены две валюты
        if (currencyMatches.length >= 2) {
            baseCurrency = currencyMatches[0];
            targetCurrency = currencyMatches[1];
        }
        // Если найдена одна валюта
        else if (currencyMatches.length === 1) {
            // Проверяем контекст: если есть "to NOK" или "в NOK"
            const toNokMatch = msg.match(/to\s+(NOK|nok)|в\s+(NOK|nok)/i);
            if (toNokMatch) {
                baseCurrency = currencyMatches[0];
                targetCurrency = 'NOK';
            } else {
                // По умолчанию: конвертируем FROM этой валюты TO NOK
                baseCurrency = currencyMatches[0];
                targetCurrency = 'NOK';
            }
        }
        // Если валют не найдено — показываем популярные
        else {
            baseCurrency = 'NOK';
            const targets = ['EUR', 'USD', 'SEK', 'GBP', 'UAH'];
            targetCurrency = targets.join(',');

            const res = await fetch(`https://api.exchangerate.host/latest?base=${baseCurrency}&symbols=${targetCurrency}`);
            const data = await res.json();

            if (!data.rates) throw new Error("API error");

            let text = `💱 **Курсы ${baseCurrency}**\n\n`;

            for (let [curr, rate] of Object.entries(data.rates)) {
                const converted = (amount * rate).toFixed(2);
                text += `**${converted} ${curr}**   (1 ${baseCurrency} = ${rate.toFixed(4)} ${curr})\n`;
            }

            text += `\n📅 Дата: ${new Date(data.date).toLocaleDateString('no-NO')}`;
            text += `\nИсточник: exchangerate.host`;

            return text;
        }

        // ===== ПОЛУЧЕНИЕ КУРСОВ =====
        const res = await fetch(`https://api.exchangerate.host/latest?base=${baseCurrency}&symbols=${targetCurrency}`);
        const data = await res.json();

        if (!data.rates || !data.rates[targetCurrency]) {
            return `Ikke kan få kurs for ${baseCurrency}/${targetCurrency}. Prøv igjen senere.`;
        }

        const rate = data.rates[targetCurrency];
        const converted = (amount * rate).toFixed(2);

        let text = `💱 **Valutakonverter**\n\n`;
        text += `**${amount} ${baseCurrency}** = **${converted} ${targetCurrency}**\n\n`;
        text += `📊 Vekslingskurs:\n`;
        text += `1 ${baseCurrency} = ${rate.toFixed(4)} ${targetCurrency}\n`;
        text += `1 ${targetCurrency} = ${(1 / rate).toFixed(4)} ${baseCurrency}\n\n`;
        text += `📅 Dato: ${new Date(data.date).toLocaleDateString('no-NO')}\n`;
        text += `🔗 Kilde: exchangerate.host`;

        return text;

    } catch (e) {
        console.error('Currency error:', e);
        return `Kunne ikke hente valutakurser. Prøv igjen senere.\n\n**Eksempler:**\n• 100 EUR to USD\n• 1000 NOK EUR\n• Valuta USD\n• 500 UAH to NOK`;
    }
}

// ====================== BOTSVAR (обновлённый) ======================
async function getBotResponse(msg) {
    const lower = msg.toLowerCase().trim();

    const timeKeywords = ['klokken', 'klokka', 'tid', 'hva er klokken', 'hvilken tid'];
    const weatherKeywords = ['vær', 'været', 'temperatur', 'grader'];
    const distanceKeywords = ['avstand', 'hvor langt', 'km fra', 'kilometer'];
    const busKeywords = ['buss', 'bussforbindelse', 'buss fra', 'buss til'];
    const auroraKeywords = ['polarlys', 'nordlys', 'aurora', 'polarlight', 'aurora borealis', 'siania'];
    const currencyKeywords = ['kurs', 'valuta', 'valutakurs', 'exchange', 'rate', 'курс', 'валюта', 'валют'];

    const hasTime = timeKeywords.some(kw => lower.includes(kw));
    const hasWeather = weatherKeywords.some(kw => lower.includes(kw));
    const hasDistance = distanceKeywords.some(kw => lower.includes(kw));
    const hasBus = busKeywords.some(kw => lower.includes(kw));
    const hasAurora = auroraKeywords.some(kw => lower.includes(kw));
    const hasCurrency = currencyKeywords.some(kw => lower.includes(kw));

    // === КУРСЫ ВАЛЮТ ===
    if (hasCurrency) {
        return await getCurrencyRate(msg);
    }

    // === ПОЛЯРНОЕ СИЯНИЕ ===
    if (hasAurora) {
        let city = msg.replace(/polarlys i|nordlys i|aurora i/gi, '').trim();
        if (!city || city.length < 2) {
            city = lower.split(' ').pop();
        }
        return await getAuroraForecast(city || "Tromsø");
    }

    // === BUSSFORBINDELSER ===
    if (hasBus) {
        const words = msg.toLowerCase().split(/\s+/);
        let fromCity = null, toCity = null;

        for (let i = 0; i < words.length; i++) {
            if ((words[i] === 'fra' || words[i] === 'from') && i + 1 < words.length) fromCity = words[i + 1];
            if ((words[i] === 'til' || words[i] === 'to') && i + 1 < words.length) toCity = words[i + 1];
        }

        if (fromCity && toCity) return await getBusConnection(fromCity, toCity);
        return "Skriv 'Buss fra Oslo til Bergen' for å sjekke bussforbindelse.";
    }

    // === AVSTAND ===
    if (hasDistance) {
        const parts = msg.split(/fra|til/i);
        let city1 = null, city2 = null;

        for (let part of parts) {
            part = part.trim();
            if (part.length > 2) {
                const coords = await getCoordinates(part);
                if (coords) {
                    if (!city1) city1 = part;
                    else if (!city2) city2 = part;
                }
            }
        }

        if (city1 && city2) {
            const result = await getDistance(city1, city2);
            if (result) return `Avstanden fra ${result.from} til ${result.to} er ca. **${result.distance} km**.`;
        }
        return "Jeg klarte ikke å finne begge byene. Prøv 'Avstand fra Oslo til Bergen'.";
    }

    // === TID OG VÆR ===
    let city = msg.replace(/klokken i|klokka i|tid i|været i|vær i/gi, '').trim();
    if (!city || city.length < 2) city = lower.split(' ').pop();

    if (!city || city.length < 2) {
        return "Skriv navnet på stedet eller spør om tid, vær, avstand, buss, polarlys eller valuta.\nEksempler:\n• Klokken i Tromsø\n• Været i Stavanger\n• Buss fra Oslo til Trondheim\n• Polarlys i Tromsø\n• Kurs 1000 NOK to EUR";
    }

    const coords = await getCoordinates(city);
    if (!coords) return `Jeg fant ikke stedet «${city}» i Norge. Prøv et mer presist navn.`;

    const cityName = coords.name || city;

    if (hasTime && hasWeather) {
        return getTimeInCity(cityName) + '\n\n' + await getWeather(coords.lat, coords.lon, cityName);
    }
    if (hasTime) return getTimeInCity(cityName);
    if (hasWeather) return await getWeather(coords.lat, coords.lon, cityName);

    return getTimeInCity(cityName) + '\n\n' + await getWeather(coords.lat, coords.lon, cityName);
}

// ====================== SEND MELDING ======================
async function sendMessage() {
    if (!canSendMessage() || !input.value.trim()) return;

    const userText = input.value.trim();
    addMessage(userText, true);
    input.value = '';
    isProcessing = true;

    const typing = showTyping();

    try {
        const botReply = await getBotResponse(userText);
        typing.remove();
        await typeMessage(botReply);
    } catch (err) {
        typing.remove();
        addMessage("Noe gikk galt. Prøv igjen.", false);
    }

    isProcessing = false;
}

// ====================== OPPSTART ======================
document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('theme') === 'light') {
        document.body.classList.add('light');
        if (themeToggle) themeToggle.textContent = '🌙';
    }

    setTimeout(() => {
        typeMessage("Hei! 👑\n\nJeg kan fortelle tid, vær, avstand, bussforbindelser, **polarlys** og **valutakurser**.\n\nEksempler:\n• Klokken i Tromsø\n• Polarlys i Tromsø\n• Kurs 1000 NOK to EUR\n• Valuta USD\n• 500 EUR to UAH");
    }, 600);

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keypress', e => { if (e.key === 'Enter') sendMessage(); });
    themeToggle.addEventListener('click', toggleTheme);
    myPositionBtn.addEventListener('click', getMyPosition);
});

// ====================== КУРСЫ ВАЛЮТ (РАБОЧИЙ КОД) ======================
async function getCurrencyRate(msg) {
    try {
        let amount = 1;
        let baseCurrency = null;
        let targetCurrencies = [];

        const upper = msg.toUpperCase();

        // Список всех поддерживаемых валют
        const supportedCurrencies = [
            'NOK','EUR','USD','GBP','SEK','DKK','CHF','PLN','CZK','HUK','RON','BGN','HRK','ISK',
            'UAH','RUB','TRY','CAD','AUD','NZD','JPY','CNY','HKD','SGD','KRW','INR','THB',
            'IDR','MYR','PHP','VND','AED','SAR','BRL','MXN','ZAR','TWD','ILS'
        ];

        // ===== ШАГИ ПАРСИНГА =====

        // ШАГ 1: Извлекаем число (если есть)
        const numberMatch = msg.match(/^\s*(\d+[\.,]?\d*)/);
        if (numberMatch) {
            amount = parseFloat(numberMatch[1].replace(',', '.'));
        }

        // ШАГ 2: Найти все валюты в сообщении
        const foundCurrencies = [];
        const regex = /\b([A-Z]{3})\b/g;
        let match;
        while ((match = regex.exec(upper)) !== null) {
            const curr = match[1];
            if (supportedCurrencies.includes(curr) && !foundCurrencies.includes(curr)) {
                foundCurrencies.push(curr);
            }
        }

        // ШАГ 3: Определяем базовую валюту и целевые валюты

        if (foundCurrencies.length >= 2) {
            baseCurrency = foundCurrencies[0];
            targetCurrencies = foundCurrencies.slice(1);
        }
        else if (foundCurrencies.length === 1) {
            baseCurrency = foundCurrencies[0];
            
            if (msg.match(/валута|valuta/i)) {
                targetCurrencies = ['EUR', 'USD', 'GBP', 'SEK', 'UAH', 'RUB', 'CAD', 'JPY'].filter(c => c !== baseCurrency);
            } else {
                targetCurrencies = baseCurrency === 'NOK' ? ['EUR', 'USD', 'GBP', 'SEK', 'UAH'] : ['NOK'];
            }
        }
        else {
            baseCurrency = 'NOK';
            targetCurrencies = ['EUR', 'USD', 'GBP', 'SEK', 'UAH'];
        }

        targetCurrencies = [...new Set(targetCurrencies)].filter(c => c !== baseCurrency);

        // ===== ПОЛУЧЕНИЕ КУРСОВ (НОВЫЙ API) =====
        // Используем ExchangeRate-API (более надежный)
        const url = `https://open.er-api.com/v6/latest/${baseCurrency}`;
        
        const res = await fetch(url);
        
        if (!res.ok) {
            throw new Error('API request failed');
        }
        
        const data = await res.json();

        if (data.result !== 'success' || !data.rates) {
            throw new Error('Invalid API response');
        }

        // ===== ФОРМАТИРОВАНИЕ ОТВЕТА =====
        let responseText = `💱 **Valutakurs - ${baseCurrency}**\n\n`;
        responseText += `**${amount} ${baseCurrency}** konverteres til:\n\n`;

        // Показываем только запрошенные валюты
        let foundAny = false;
        for (let currency of targetCurrencies) {
            if (data.rates[currency]) {
                const rate = data.rates[currency];
                const converted = (amount * rate).toFixed(2);
                const rateStr = rate.toFixed(4);
                responseText += `• **${converted} ${currency}** (1 ${baseCurrency} = ${rateStr} ${currency})\n`;
                foundAny = true;
            }
        }

        if (!foundAny) {
            responseText += `Valutakursene ble lastet inn, men ingen målvalutaer ble funnet.\n`;
        }

        responseText += `\n📅 Dato: ${new Date().toLocaleDateString('no-NO')}`;
        responseText += `\n🔗 Kilde: open.er-api.com`;

        return responseText;

    } catch (e) {
        console.error('Currency error:', e);
        return `❌ Kunne ikke hente valutakurser.\n\n📝 **Prøv disse eksemplene:**\n• Valuta USD\n• Valuta NOK\n• 100 EUR to USD\n• 500 NOK EUR\n• 1000 UAH GBP`;
    }
}