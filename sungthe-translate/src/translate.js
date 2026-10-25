load('api.js');
load('baidu.js');
load('prompts.js');
var TRANSLATION_MEMORY_TABLE = "translation_memory";
var MAX_MEMORY_ROWS = 2000;
var MAX_MEMORY_MATCHES = 80;
var MAX_LEARNED_ITEMS = 10;
var MAX_CHINESE_REPAIR_FRAGMENTS = 40;
var CHINESE_FRAGMENT_CONTEXT_LENGTH = 160;

function execute(text, from, to, source, model, style) {
    text = text || "";
    from = from || "auto";
    to = to || "";
    source = source || "";
    model = apiResolveModel(model);
    style = style || "natural";

    if (!text) {
        return Response.success("");
    }
    if (!to) {
        return Response.error("Chưa chọn ngôn ngữ đích");
    }

    if (!shouldUseApi(source)) {
        return translateWithFallback(text, from, to, source);
    }

    var apiKeys = readApiKeys();
    if (apiKeys.length === 0) {
        return Response.error("Vui lòng thêm API key trong cài đặt extension");
    }

    var temperature = readNumber("temperature", 0.2, 0, 2);
    var maxOutputTokens = Math.round(readNumber("max_output_tokens", 16384, 256, 65536));
    var customInstruction = readBookCustomInstruction();
    var endpoint = apiResolveEndpoint();
    var memoryContext = loadTranslationMemory(text, from, to, source);
    var learnMemory = memoryContext.enabled && readBoolean("auto_translation_memory", true);
    var systemInstruction = buildInstruction(
        from,
        to,
        source,
        style,
        customInstruction,
        memoryContext.prompt,
        learnMemory
    );

    var request = {
        model: model,
        messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: text }
        ],
        temperature: temperature,
        max_tokens: maxOutputTokens
    };
    if (learnMemory && apiJsonMode(model)) request.response_format = { type: "json_object" };
    var requestBody = JSON.stringify(request);

    var lastError = "";
    for (var keyIndex = 0; keyIndex < apiKeys.length; keyIndex++) {
        var response;
        try {
            response = fetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + apiKeys[keyIndex]
                },
                body: requestBody,
                timeout: 120000
            });
        } catch (requestError) {
            return Response.error("Không thể kết nối API: " + String(requestError));
        }

        if (!response.ok) {
            lastError = readApiError(response);
            if (response.status === 401 || response.status === 403 || response.status === 429) continue;
            return Response.error(lastError);
        }

        var responseText = response.text();
        var data;
        try {
            data = JSON.parse(responseText);
        } catch (e2) {
            return Response.error("API trả về dữ liệu không hợp lệ");
        }

        var translated = extractText(data);
        if (!translated) {
            var reason = blockedReason(data);
            return Response.error(reason ? "API không thể dịch: " + reason : "API không trả về bản dịch");
        }

        var cleaned = stripCodeFence(translated);
        var parsedResult = parseTranslationResult(cleaned, learnMemory);
        var finalText = parsedResult.translation;
        if (!finalText) {
            return Response.error("API không trả về bản dịch hợp lệ");
        }

        if (shouldRepairChinese(finalText, text, from, to)) {
            finalText = repairRemainingChinese(
                endpoint,
                apiKeys[keyIndex],
                model,
                finalText,
                memoryContext.prompt,
                maxOutputTokens
            );
        }

        if (learnMemory) {
            persistTranslationMemory(memoryContext, text, finalText, parsedResult.memory);
        }

        return Response.success(finalText);
    }

    return Response.error(lastError || "Không có API key khả dụng");
}

function shouldUseApi(source) {
    if (source === "tableOfContent") return readBoolean("translate_table_of_content", false);
    if (source === "detail") return readBoolean("translate_detail", false);
    if (source === "discovery") return readBoolean("translate_discovery", false);
    return true;
}

function translateWithFallback(text, from, to, source) {
    if (readBoolean("use_qt_fallback", true)) {
        var qtText = translateWithQt(text, from, to, source);
        if (qtText) {
            return Response.success(qtText);
        }
    }

    var baiduResult = baiduTranslateText(text, from, to);
    if (baiduResult.text) {
        return Response.success(baiduResult.text);
    }
    return Response.error(baiduResult.error || "Không thể dịch bằng Baidu");
}

function translateWithQt(text, from, to, source) {
    if (to !== "vi") return "";
    if (!isChineseSource(text, from)) return "";

    try {
        var result = Qt.translate(text, to, {
            source: source,
            chapter_name: source === "tableOfContent",
            first_line_chapter_name: source === "tableOfContent",
            first_capitalize: true
        });
        var translated = result && result.translateText ? String(result.translateText).trim() : "";
        return translated && translated !== String(text).trim() ? translated : "";
    } catch (e) {
        return "";
    }
}

function loadTranslationMemory(text, from, to, source) {
    var context = {
        enabled: false,
        bookId: "",
        prompt: "",
        existing: {},
        included: {},
        lines: []
    };

    if (!readBoolean("use_translation_memory", true)) return context;

    if (source !== "chapterContent" || to !== "vi" || !isChineseSource(text, from)) return context;

    var info;
    try {
        info = localBook.getInfo();
    } catch (e) {
        return context;
    }

    if (!info || !info.id) return context;

    context.enabled = true;
    context.bookId = String(info.id);

    try {
        var totalRows = localDatabase.count(context.bookId, TRANSLATION_MEMORY_TABLE);
        var rows;
        if (totalRows > MAX_MEMORY_ROWS) {
            var half = Math.floor(MAX_MEMORY_ROWS / 2);
            rows = localDatabase.list(context.bookId, TRANSLATION_MEMORY_TABLE, 0, half);
            var recentRows = localDatabase.list(
                context.bookId,
                TRANSLATION_MEMORY_TABLE,
                Math.max(0, totalRows - half),
                half
            );
            for (var recentIndex = 0; recentRows && recentIndex < recentRows.length; recentIndex++) {
                rows.push(recentRows[recentIndex]);
            }
        } else {
            rows = localDatabase.list(context.bookId, TRANSLATION_MEMORY_TABLE, 0, MAX_MEMORY_ROWS);
        }

        for (var i = 0; rows && i < rows.length; i++) {
            var rowKey = String(rows[i].key || "").trim();
            if (!rowKey) continue;
            context.existing[rowKey] = true;
            addStoredMemoryLine(context, rowKey, String(rows[i].value || ""), text);
        }

    } catch (databaseError) {}

    try {
        addBookDictionary(context, text, localBook.getNames(), "name");
        addBookDictionary(context, text, localBook.getQtNames(), "name");
        addBookDictionary(context, text, localBook.getQtVietPhrases(), "term");
    } catch (dictionaryError) {}

    if (context.lines.length > 0) {
        context.prompt = "Use this book-specific translation memory exactly. Never rename or reinterpret these entries:\n" +
            context.lines.join("\n");
    }

    return context;
}

function addStoredMemoryLine(context, source, rawValue, text) {
    var target = rawValue;
    var kind = "term";
    var note = "";
    var aliases = [];
    var details = [];

    try {
        var data = JSON.parse(rawValue);
        if (data && data.target) target = String(data.target);
        if (data && data.kind) kind = String(data.kind);
        if (data && data.note) note = String(data.note);
        if (data && Array.isArray(data.aliases)) aliases = data.aliases;
        if (data && data.gender && data.gender !== "unknown") details.push("giới tính: " + oneLine(data.gender));
        if (data && data.role) details.push("vai trò: " + oneLine(data.role));
        if (data && Array.isArray(data.relationships)) {
            for (var relationshipIndex = 0; relationshipIndex < data.relationships.length; relationshipIndex++) {
                var relationship = data.relationships[relationshipIndex];
                if (!relationship || !relationship.with || !relationship.type) continue;
                var relationshipText = oneLine(relationship.with) + ": " + oneLine(relationship.type);
                if (relationship.addressTo) relationshipText += ", gọi họ: " + oneLine(relationship.addressTo);
                if (relationship.addressFrom) relationshipText += ", họ gọi lại: " + oneLine(relationship.addressFrom);
                details.push("quan hệ " + relationshipText);
            }
        }
        if (data && data.autoNote) details.push(oneLine(data.autoNote));
    } catch (e) {}

    var matched = text.indexOf(source) >= 0;
    var validAliases = [];
    for (var aliasIndex = 0; aliasIndex < aliases.length; aliasIndex++) {
        var alias = oneLine(aliases[aliasIndex]);
        if (!alias || alias === source) continue;
        validAliases.push(alias);
        if (text.indexOf(alias) >= 0) matched = true;
    }
    if (!matched) return;

    if (note) details.unshift(note);
    var displaySource = source;
    if (validAliases.length > 0) displaySource += " (còn gọi: " + validAliases.join(", ") + ")";
    addMemoryLine(context, displaySource, target, kind, details.join("; "));
}

function addBookDictionary(context, text, dictionary, kind) {
    if (!dictionary) return;
    for (var source in dictionary) {
        if (!dictionary.hasOwnProperty(source)) continue;
        source = String(source || "").trim();
        if (!source || text.indexOf(source) < 0) continue;
        addMemoryLine(context, source, String(dictionary[source] || ""), kind, "");
        if (context.lines.length >= MAX_MEMORY_MATCHES) return;
    }
}

function addMemoryLine(context, source, target, kind, note) {
    if (!source || !target || context.included[source]) return;
    if (context.lines.length >= MAX_MEMORY_MATCHES) return;

    context.included[source] = true;
    var line = "- " + oneLine(source) + " => " + oneLine(target) + " [" + oneLine(kind || "term") + "]";
    if (note) line += " — " + oneLine(note);
    context.lines.push(line);
}

function parseTranslationResult(value, expectsMemory) {
    var raw = stripCodeFence(String(value || "")).trim();
    var data = parseTranslationJson(raw);
    var translation = readTranslationValue(data);

    if (translation) {
        return {
            translation: translation,
            memory: expectsMemory && Array.isArray(data.memory) ? data.memory : []
        };
    }

    var extracted = extractLooseTranslation(raw);
    if (extracted) return { translation: extracted, memory: [] };

    if (!looksLikeJsonResult(raw)) {
        return { translation: raw, memory: [] };
    }

    return { translation: "", memory: [] };
}

function parseTranslationJson(value) {
    try {
        return JSON.parse(value);
    } catch (e) {}

    var start = value.indexOf("{");
    var end = value.lastIndexOf("}");
    if (start < 0 || end <= start) return null;

    try {
        return JSON.parse(value.substring(start, end + 1));
    } catch (e2) {
        return null;
    }
}

function readTranslationValue(data) {
    if (!data || data.translation === null || data.translation === undefined) return "";
    if (typeof data.translation === "string") return data.translation;
    if (data.translation && typeof data.translation.text === "string") return data.translation.text;
    return "";
}

function extractLooseTranslation(value) {
    var memoryDelimited = value.match(/"translation"\s*:\s*"([\s\S]*)"\s*,\s*"memory"\s*:/);
    if (memoryDelimited) return decodeLooseJsonString(memoryDelimited[1]);

    var match = value.match(/"translation"\s*:\s*"((?:\\.|[^"\\])*)"/);
    return match ? decodeLooseJsonString(match[1]) : "";
}

function decodeLooseJsonString(value) {
    try {
        return String(JSON.parse('"' + value + '"'));
    } catch (e) {}

    try {
        var escapedControls = value
            .replace(/\r/g, "\\r")
            .replace(/\n/g, "\\n")
            .replace(/\t/g, "\\t");
        return String(JSON.parse('"' + escapedControls + '"'));
    } catch (e2) {}

    return String(value)
        .replace(/\\r\\n/g, "\n")
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\")
        .trim();
}

function looksLikeJsonResult(value) {
    var trimmed = String(value || "").trim();
    return trimmed.charAt(0) === "{" || trimmed.charAt(0) === "[" || /"translation"\s*:/.test(trimmed);
}

function persistTranslationMemory(context, input, translatedText, items) {
    if (!context.bookId || !Array.isArray(items) || items.length === 0) return;

    var records = [];
    for (var i = 0; i < items.length && records.length < MAX_LEARNED_ITEMS; i++) {
        var item = items[i];
        if (!item) continue;

        var source = String(item.source || "").trim();
        var target = String(item.target || "").trim();
        if (!source || !target || context.existing[source]) continue;
        if (source.length > 80 || target.length > 160) continue;
        if (!containsChinese(source) || input.indexOf(source) < 0) continue;
        if (translatedText.indexOf(target) < 0) continue;

        var kind = normalizeMemoryKind(item.kind);
        var note = oneLine(String(item.note || ""));
        if (note.length > 300) note = note.substring(0, 300);

        records.push({
            key: source,
            value: JSON.stringify({ target: target, kind: kind, note: note })
        });
        context.existing[source] = true;
    }

    if (records.length === 0) return;

    try {
        localDatabase.upsertAll(context.bookId, TRANSLATION_MEMORY_TABLE, records);
    } catch (e) {}
}

function normalizeMemoryKind(value) {
    var kind = String(value || "term").toLowerCase();
    if (kind === "character" || kind === "place" || kind === "organization" || kind === "term") {
        return kind;
    }
    return "term";
}

function shouldRepairChinese(translated, original, from, to) {
    if (!readBoolean("retry_untranslated_chinese", true)) return false;
    if (to !== "vi" || !isChineseSource(original, from)) return false;
    var count = countChinese(translated);
    if (count === 0) return false;
    return true;
}

function repairRemainingChinese(endpoint, apiKey, model, draft, memoryPrompt, maxOutputTokens) {
    var previous = String(draft || "");
    var matches = previous.match(/[\u3400-\u9fff\uf900-\ufaff]+/g) || [];
    var seen = {};
    var items = [];

    for (var index = 0; index < matches.length; index++) {
        var fragment = String(matches[index] || "");
        if (!fragment || seen[fragment]) continue;
        seen[fragment] = true;
        items.push({
            id: String(items.length),
            fragment: fragment,
            context: chineseFragmentContext(previous, fragment)
        });
        if (items.length > MAX_CHINESE_REPAIR_FRAGMENTS) return previous;
    }

    if (items.length === 0) return previous;

    var replacements = translateChineseFragmentsOnce(
        endpoint,
        apiKey,
        model,
        items,
        memoryPrompt,
        maxOutputTokens
    );
    if (!replacements) return previous;

    var repaired = previous;
    for (var itemIndex = 0; itemIndex < items.length; itemIndex++) {
        var item = items[itemIndex];
        var replacement = replacements[item.id];
        if (!replacement || countChinese(replacement) > 0) return previous;
        repaired = repaired.split(item.fragment).join(replacement);
    }

    return countChinese(repaired) === 0 ? repaired : previous;
}

function chineseFragmentContext(text, fragment) {
    var value = String(text || "");
    var position = value.indexOf(fragment);
    if (position < 0) return fragment;
    var start = Math.max(0, position - CHINESE_FRAGMENT_CONTEXT_LENGTH);
    var end = Math.min(value.length, position + fragment.length + CHINESE_FRAGMENT_CONTEXT_LENGTH);
    return value.substring(start, end);
}

function translateChineseFragmentsOnce(endpoint, apiKey, model, items, memoryPrompt, maxOutputTokens) {
    var instruction = "Translate every supplied Chinese fragment into natural Vietnamese for insertion into an existing literary translation. " +
        "Use each item's context only to resolve meaning, names, and address terms. Do not translate or return the context. " +
        "Return only one valid JSON object without Markdown using this exact shape: " +
        '{"items":[{"id":"0","translation":"Vietnamese replacement"}]}. ' +
        "Return every input id exactly once. Each translation must contain only the replacement for its fragment.";
    if (memoryPrompt) instruction += "\n\n" + memoryPrompt;

    var request = {
        model: model,
        messages: [
            { role: "system", content: instruction },
            { role: "user", content: JSON.stringify({ items: items }) }
        ],
        temperature: 0,
        max_tokens: Math.min(maxOutputTokens || 4096, 4096)
    };
    if (apiJsonMode(model)) request.response_format = { type: "json_object" };
    var body = JSON.stringify(request);

    try {
        var response = fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + apiKey
            },
            body: body,
            timeout: 30000
        });
        if (!response.ok) return "";

        var data = JSON.parse(response.text());
        var output = stripCodeFence(extractText(data)).trim();
        if (!output) return null;

        var parsed = parseTranslationJson(output);
        if (!parsed || !Array.isArray(parsed.items)) return null;

        var replacements = {};
        for (var index = 0; index < parsed.items.length; index++) {
            var translatedItem = parsed.items[index];
            if (!translatedItem || translatedItem.id === undefined) continue;
            var id = String(translatedItem.id);
            var translation = String(translatedItem.translation || "").trim();
            if (translation) replacements[id] = translation;
        }
        return replacements;
    } catch (e) {
        return null;
    }
}

function containsChinese(value) {
    return /[\u3400-\u9fff\uf900-\ufaff]/.test(String(value || ""));
}

function countChinese(value) {
    var matches = String(value || "").match(/[\u3400-\u9fff\uf900-\ufaff]/g);
    return matches ? matches.length : 0;
}

function oneLine(value) {
    return String(value || "").replace(/[\r\n\t]+/g, " ").trim();
}

function isChineseSource(text, from) {
    var language = String(from || "auto").toLowerCase();
    if (language === "zh" || language.indexOf("zh-") === 0) return true;
    if (language !== "auto") return false;
    return /[\u3400-\u9fff\uf900-\ufaff]/.test(text);
}

function readConfig(key, fallback) {
    var value = localConfig.getItem(key);
    return value === null || value === undefined || value === "" ? fallback : String(value);
}

function readBookCustomInstruction() {
    try {
        var info = localBook.getInfo();
        if (info && info.id) {
            var key = translationBookPromptConfigKey(String(info.id));
            return readConfig(key, "").trim();
        }
    } catch (e) {}
    return "";
}

function readBoolean(key, fallback) {
    return readConfig(key, fallback ? "true" : "false") === "true";
}

function readApiKeys() {
    var raw = readConfig("api_key", "").trim();
    if (!raw) return [];

    var values;
    try {
        values = JSON.parse(raw);
    } catch (e) {
        values = raw.split("\n");
    }
    if (!Array.isArray(values)) values = [String(values)];

    var keys = [];
    for (var i = 0; i < values.length; i++) {
        var key = String(values[i] || "").trim();
        if (key && keys.indexOf(key) === -1) keys.push(key);
    }
    return keys;
}

function readApiError(response) {
    var errorText = response.text();
    var errorData;
    try {
        errorData = JSON.parse(errorText);
    } catch (e) {
        errorData = null;
    }
    var message = apiErrorMessage(errorData);
    return "API HTTP " + response.status + (message ? ": " + message : "");
}

function readNumber(key, fallback, min, max) {
    var value = parseFloat(readConfig(key, String(fallback)));
    if (isNaN(value)) value = fallback;
    if (value < min) value = min;
    if (value > max) value = max;
    return value;
}

function buildInstruction(from, to, source, style, customInstruction, memoryPrompt, includeMemory) {
    var sourceLanguage = from === "auto" ? "the automatically detected source language" : from;
    var instruction = "You are a professional literary translator. Translate the user text from " +
        sourceLanguage + " to " + to + ". Preserve meaning, tone, paragraph breaks, " +
        "line breaks, HTML/Markdown structure, URLs, numbers, and placeholders such as <N1> exactly.";

    var stylePrompt = loadTranslationStylePrompt(style);
    if (stylePrompt) instruction += "\n\nSTORY TRANSLATION STYLE:\n" + stylePrompt;

    if (source === "chapterContent") {
        instruction += " Produce fluent prose suitable for a book chapter.";
    } else if (source === "tableOfContent") {
        instruction += " Keep chapter numbering and make each title concise.";
    } else if (source === "detail") {
        instruction += " Preserve metadata labels and any HTML structure.";
    } else if (source === "discovery") {
        instruction += " Keep titles, tags, and short descriptions concise.";
    }

    if (customInstruction) instruction += " Additional instruction: " + customInstruction;

    if (memoryPrompt) instruction += "\n\n" + memoryPrompt;

    if (includeMemory) {
        instruction += " Return one valid JSON object only with this shape: " +
            '{"translation":"complete translated text","memory":[{"source":"exact Chinese source term","target":"matching Vietnamese form","kind":"character|place|organization|term","note":"short useful note"}]}. ' +
            "The translation must be complete and preserve all paragraph and line breaks. " +
            "Include at most 10 high-confidence proper names or recurring terms in memory; source must be an exact Chinese substring and target must appear exactly in the translation. " +
            "Use an empty memory array when uncertain. Escape JSON strings correctly.";
    } else {
        instruction += " Return only the translated text, without explanations, labels, quotation marks, or Markdown fences.";
    }
    return instruction;
}

function loadTranslationStylePrompt(style) {
    var selected = translationNormalizeStyle(style);
    try {
        var stored = localDatabase.get(TRANSLATION_PROMPT_SCOPE, TRANSLATION_PROMPT_TABLE, selected);
        if (stored !== null && stored !== undefined) {
            return String(stored).trim();
        }
    } catch (e) {}
    return translationDefaultPrompt(selected);
}

function extractText(data) {
    if (!data || !data.choices || data.choices.length === 0) return "";
    var message = data.choices[0].message;
    if (!message || !message.content) return "";
    return String(message.content);
}

function blockedReason(data) {
    if (data && data.choices && data.choices.length > 0 && data.choices[0].finish_reason) {
        var reason = String(data.choices[0].finish_reason);
        if (reason !== "stop" && reason !== "length") return reason;
    }
    return "";
}

function stripCodeFence(text) {
    var value = String(text).trim();
    var match = value.match(/^```[^\n]*\n([\s\S]*?)\n```$/);
    return match ? match[1] : value;
}
