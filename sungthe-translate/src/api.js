var API_DEFAULT_BASE_URL = "https://api.deepseek.com";
var API_DEFAULT_MODEL = "deepseek-chat";
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
            id: "deepseek-chat",
            name: "DeepSeek Chat",
            description: "DeepSeek-V3, nhanh và thông minh, tối ưu chi phí",
            isNetworkRequired: true
        },
        {
            id: "deepseek-reasoner",
            name: "DeepSeek Reasoner",
            description: "DeepSeek-R1, chuyên suy luận logic phức tạp",
            isNetworkRequired: true
        }
    ];
}

// DeepSeek reasoner and some OpenAI-compatible hosts reject response_format.
function apiJsonMode(model) {
    if (apiReadSetting("use_json_response", "true") !== "true") return false;
    return String(model || "").toLowerCase().indexOf("reasoner") < 0;
}
