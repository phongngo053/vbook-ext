load('prompts.js');

function execute() {
    var config = {
        base_url: {
            title: "Base URL",
            subtitle: "Nhập https://host hoặc https://host/v1 hoặc URL đầy đủ .../chat/completions",
            default: "https://api.deepseek.com",
            mode: "input",
            format: "text"
        },
        custom_model: {
            title: "Model tùy chỉnh",
            subtitle: "Dùng khi chọn model 'Model tùy chỉnh'; nhập đúng id model của nhà cung cấp",
            default: "deepseek-chat",
            mode: "input",
            format: "text"
        },
        api_key: {
            title: "API keys",
            subtitle: "Danh sách API key; tự chuyển key khi hết quota",
            default: "",
            mode: "list",
            format: "text"
        },
        temperature: {
            title: "Temperature",
            subtitle: "0.0 - 2.0; giá trị thấp giúp bản dịch ổn định",
            default: "0.2",
            mode: "input",
            format: "number"
        },
        max_output_tokens: {
            title: "Số token đầu ra tối đa",
            default: "16384",
            mode: "input",
            format: "number"
        },
        use_json_response: {
            title: "Dùng JSON mode của API",
            subtitle: "Tắt nếu nhà cung cấp không hỗ trợ response_format; model reasoner luôn tắt",
            default: "true",
            mode: "toggle"
        },

        retry_untranslated_chinese: {
            title: "Tự sửa phần tiếng Trung còn sót",
            subtitle: "Gom các cụm tiếng Trung còn sót và gọi API đúng 1 lần; nếu lần sửa lỗi thì giữ nguyên bản dịch ban đầu",
            default: "true",
            mode: "toggle"
        },
        translate_table_of_content: {
            title: "Dùng API dịch mục lục",
            subtitle: "Tắt: dùng QT trước, sau đó fallback sang Baidu",
            default: "false",
            mode: "toggle"
        },
        translate_detail: {
            title: "Dùng API dịch chi tiết",
            subtitle: "Tắt: dùng QT trước, sau đó fallback sang Baidu",
            default: "false",
            mode: "toggle"
        },
        translate_discovery: {
            title: "Dùng API dịch khám phá",
            subtitle: "Tắt: dùng QT trước, sau đó fallback sang Baidu",
            default: "false",
            mode: "toggle"
        },
        use_qt_fallback: {
            title: "Ưu tiên QT khi dịch bổ sung",
            subtitle: "Chỉ áp dụng cho nội dung tiếng Trung sang tiếng Việt; nếu tắt hoặc QT không dùng được sẽ chuyển sang Baidu",
            default: "true",
            mode: "toggle"
        },
        translation_prompts: {
            title: "Prompt phong cách dịch truyện",
            subtitle: "Dùng chung cho mọi truyện; khi thêm prompt mới hãy để trống bookId, nhập key là ID style và value là nội dung prompt",
            mode: "database"
        },
        use_translation_memory: {
            title: "Sử dụng bộ nhớ dịch",
            subtitle: "Áp dụng tên riêng, địa danh, thuật ngữ và quan hệ đã lưu cho truyện hiện tại",
            default: "true",
            mode: "toggle"
        },
        auto_translation_memory: {
            title: "Tự động học bộ nhớ dịch",
            subtitle: "Tự lưu thực thể mới trong cùng lượt gọi API khi dịch chương; chỉ hoạt động khi Sử dụng bộ nhớ dịch đang bật",
            default: "true",
            mode: "toggle"
        },
        memory_analysis_chapters: {
            title: "Số chương phân tích",
            subtitle: "Action sẽ đọc từ chương đang đọc và các chương kế sau, tối đa theo số lượng này",
            default: "5",
            mode: "input",
            format: "number"
        }
    };

    initializeTranslationPrompts();

    var bookInfo = null;
    try {
        bookInfo = localBook.getInfo();
    } catch (e) {}

    if (bookInfo && bookInfo.id) {
        var bookPromptKey = translationBookPromptConfigKey(String(bookInfo.id));
        config[bookPromptKey] = {
            title: "Yêu cầu dịch riêng cho truyện",
            subtitle: "Chỉ áp dụng cho truyện hiện tại, ví dụ: giữ cách xưng hô theo phong cách kiếm hiệp",
            default: "",
            mode: "input",
            format: "text"
        };
        config.translation_memory = {
            title: "Bộ nhớ dịch theo truyện",
            subtitle: "Tên riêng, địa danh, thuật ngữ và quan hệ do API ghi nhớ; có thể thêm, sửa hoặc xóa thủ công",
            mode: "database"
        };
    }

    return Response.success(config);
}

function initializeTranslationPrompts() {
    try {
        if (localDatabase.count(TRANSLATION_PROMPT_SCOPE, TRANSLATION_PROMPT_TABLE) > 0) return;
        var defaults = translationDefaultPrompts();
        var rows = [];
        for (var style in defaults) {
            if (!defaults.hasOwnProperty(style)) continue;
            rows.push({ key: style, value: defaults[style] });
        }
        if (rows.length > 0) localDatabase.upsertAll(TRANSLATION_PROMPT_SCOPE, TRANSLATION_PROMPT_TABLE, rows);
    } catch (e) {}
}
