var API_DEFAULT_BASE_URL = "https://ai.sungthe.online/v1";
var API_DEFAULT_MODEL = "gemma4";
var API_ENDPOINT_PATH = "/chat/completions";
var API_CUSTOM_MODEL_ID = "custom";

function apiReadSetting(key, fallback) {
    try {
        var value = localConfig.getItem(key);
        if (value === null || value === undefined) return fallback;
        var text = String(value).trim();
        return text ? text : fallback;
    } catch (e) {}
    return fallback;
}

// Accepts "https://host", "https://host/v1" or a full ".../chat/completions" URL.
function apiResolveEndpoint() {
    var base = apiReadSetting("base_url", API_DEFAULT_BASE_URL).replace(/\s+/g, "");
    while (base.length > 0 && base.charAt(base.length - 1) === "/") {
        base = base.substring(0, base.length - 1);
    }
    if (!base) base = API_DEFAULT_BASE_URL;
    if (base.indexOf("://") < 0) base = "https://" + base;
    if (!/\/chat\/completions$/.test(base)) base += API_ENDPOINT_PATH;
    return base;
}

// A picked preset wins; "custom" or an empty pick falls back to the free-form setting.
function apiResolveModel(selected) {
    var picked = String(selected || "").trim();
    if (picked && picked !== API_CUSTOM_MODEL_ID) return picked;
    return apiReadSetting("custom_model", API_DEFAULT_MODEL);
}

function apiPresetModels() {
    return [
        {
            id: "gemma4",
            name: "Gemma 4",
            description: "Model mặc định của ai.sungthe.online",
            isNetworkRequired: true
        }
    ];
}

// Some OpenAI-compatible hosts reject response_format; reasoner models always do.
function apiJsonMode(model) {
    if (apiReadSetting("use_json_response", "true") !== "true") return false;
    return String(model || "").toLowerCase().indexOf("reasoner") < 0;
}

// Providers report {"error":{"message":"..."}} or the flat {"error":"..."}.
function apiErrorMessage(data) {
    if (!data || !data.error) return "";
    var nested = data.error.message;
    if (nested) return String(nested);
    var flat = String(data.error);
    return flat.indexOf("[object") === 0 ? "" : flat;
}

// Some OpenAI-compatible backends reject response_format with HTTP 400. Retry once
// without it so JSON mode stays an optimisation instead of a hard requirement.
function apiPost(endpoint, apiKey, body, timeoutMs) {
    var response = fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + apiKey
        },
        body: body,
        timeout: timeoutMs
    });
    if (!response || response.ok) return response;
    if (response.status !== 400) return response;

    var errorText = "";
    try {
        errorText = String(response.text() || "");
    } catch (e) {}
    if (errorText.toLowerCase().indexOf("response_format") < 0) return response;

    var parsed;
    try {
        parsed = JSON.parse(body);
    } catch (e2) {
        return response;
    }
    if (!parsed || !parsed.response_format) return response;

    delete parsed.response_format;
    return fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + apiKey
        },
        body: JSON.stringify(parsed),
        timeout: timeoutMs
    });
}
