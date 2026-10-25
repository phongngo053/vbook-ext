load('api.js');

function execute() {
    var models = apiPresetModels();
    var customModel = apiReadSetting("custom_model", API_DEFAULT_MODEL);

    models.push({
        id: API_CUSTOM_MODEL_ID,
        name: "Model tùy chỉnh",
        description: "Đang dùng: " + customModel + " — đổi ở cài đặt extension (Model tùy chỉnh)",
        isNetworkRequired: true
    });

    return Response.success(models);
}
