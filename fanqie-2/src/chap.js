load("config.js");

// function getUrlChapter(chapterId, code) {
//   return `https://api.softrr.cn/api/fanqie/?id=${chapterId}&code=${code}`;
// }

function getUrlChapter(chapterId, code) {
  return `http://rehaofan.jingluo.love/content?item_id=${chapterId}`;
}

function execute(url) {
  const regex = /(?:item_id=|\/)(\d+)$/;
  let chapid = url.match(regex)[1];
  url = getUrlChapter(chapid, getVerifyCode());

  const response = fetch(url);
  if (response.ok) {
    const json = response.json();
    const htmlContent = json.data;
    return Response.success(extractChapterContent(htmlContent));
  } else {
    return Response.error("API bên thứ 3 đã cook :))");
  }
}

function extractChapterContent(htmlString) {
  const articleStart = htmlString.indexOf("<article>");
  const articleEnd = htmlString.indexOf("</article>");
  const articleContent = htmlString.substring(articleStart + 9, articleEnd);

  let result = articleContent
    .replace(/<p[^>]*>/g, "")
    .replace(/<\/p>/g, "<br><br>")
    .trim();

  return result;
}

function getVerifyCode() {
  // const VERIFY_URL = "https://api.softrr.cn/api/verification/?id=1";
  // const response = fetch(VERIFY_URL);
  // if (response.ok) {
  //   const json = response.json();
  //   const code = json.code;
  //   return code;
  // } else {
  //   return Response.error("Lỗi verify code");
  // }
}
