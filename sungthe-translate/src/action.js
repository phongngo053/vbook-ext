function execute() {
    var actions = {};
    try {
        var book = localBook.getInfo();
        if (book && book.id) {
            actions.analyze_translation_memory = {
                name: "Phân tích tên và quan hệ",
                description: "Phân tích từ chương đang đọc và các chương kế sau để cập nhật bộ nhớ dịch của truyện",
                script: "analyze-memory.js"
            };
        }
    } catch (e) {}
    return Response.success(actions);
}
