load("config.js");

//api.cenguigui.cn/api/tomato/content.php?item_id=${extractedId}
const URL_CHAPTER = "https://api.cenguigui.cn/api/tomato/content.php?item_id=";

https: function execute(url) {
  const regex = /(?:item_id=|\/)(\d+)$/;
  let chapid = url.match(regex)[1];
  url = URL_CHAPTER + chapid;

  let response_chapter_info = fetch(url);

  if (response_chapter_info.ok) {
    let json = response_chapter_info.json();
    // let chapter_info = json.data.data.content.replace(
    //   /<br\s*\/?>|\n/g,
    //   "<br><br>"
    // ); // get data from fanqie app

    let chapter_info = json.data.content.replace(/<br\s*\/?>|\n/g, "<br><br>");
    return Response.success(chapter_info);
  }
  return Response.error("API bên thứ 3 đã cook :))");
}
