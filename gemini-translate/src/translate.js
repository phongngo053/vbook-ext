load("language_list.js");

const secret = "mysecret";
let keyIndex = 0;

function xorDecrypt(encoded, key) {
  const decoded = Buffer.from(encoded, "base64").toString("binary");
  let result = "";
  for (let i = 0; i < decoded.length; i++) {
    result += String.fromCharCode(
      decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length)
    );
  }
  return result;
}

//FREE GEMINI API KEY so i don't upset if they in internet :))
//Tui không muốn lộ quá thô thôi :)) chứ biết up lên là lộ rồi
const API_ENCRYPTEDS = [
  "LDAJBDALJw4vNEAcJCU3NkA3QBI8AxwmWBgiIgsmDDlbTV4jTjws",
  "LDAJBDALIT9VEhBWLigjQgQYBCNQNx1HARMAFS0ESDxZFBkBVhQG",
  "LDAJBDALJkU8ODchE0ouRCI1RzcsHSgEWy9DNwwDUQYyPiNRUEUC",
  "LDAJBDALJjYOGEsJAh0sTVxOMVMLNwk9CCY7LQg4EzkUEgsHEDYw",
];

function getNextApiKey() {
  const key = xorDecrypt(API_ENCRYPTEDS[keyIndex]);
  keyIndex = (keyIndex + 1) % API_ENCRYPTEDS.length;
  return key;
}

function execute(text, from, to, apiKey) {
  return translateContent(text, from, to, 0, keyApi, getNextApiKey());
}

function translateContent(text, from, to, retryCount, keyApi) {
  if (retryCount > 2) return null;

  let rawText = text;
  let modelId = "gemini-2.0-flash";
  let generateContentApi = "generateContent";
  let requestBody = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Persona:
  Bạn là một dịch giả lão luyện, chuyên sâu trong thể loại tiên hiệp và kiếm hiệp Trung Quốc cổ đại, với khả năng biến văn bản Trung Quốc thành tiếng Việt mượt mà, đầy đủ, và đậm chất văn hóa. Nhiệm vụ của bạn là dịch đoạn văn bản tiên hiệp Trung Quốc sang tiếng Việt, giữ nguyên nội dung, phong cách, và tinh thần của nguyên tác, đồng thời đảm bảo bản dịch tự nhiên, dễ hiểu, và cuốn hút độc giả Việt Nam. Output chỉ chứa đoạn truyện đã dịch, không thêm bất kỳ chú thích, giải thích, hay từ tiếng Trung nào, trừ khi không thể dịch thì giữ nguyên từ gốc.
  
  Yêu cầu cụ thể:
  
  Phong cách:
  Duy trì phong cách cổ điển, hào hùng, và bi tráng đặc trưng của tiên hiệp - kiếm hiệp. Sử dụng ngôn ngữ giàu hình ảnh, nhịp điệu câu văn mạnh mẽ, tái hiện bầu không khí huyền bí, oai phong, và đậm chất giang hồ.
  Tránh lối viết hiện đại hóa hoặc quá khô khan. Văn phải có hồn, như lời kể của một lão tiền bối dưới ánh trăng.
  Ngôn ngữ:
  Sử dụng từ Hán Việt phổ biến, dễ hiểu (ví dụ: "thiên địa", "vạn cổ", "huyền công"), phù hợp với bối cảnh cổ đại và địa vị nhân vật.
  Tránh từ ngữ tối nghĩa hoặc quá hiếm. Nếu cần, thay bằng từ đồng nghĩa gần gũi hơn (ví dụ: "bất quá" thành "tuy nhiên", "thanh âm" thành "giọng nói").
  Kết hợp từ thuần Việt khi cần để câu văn tự nhiên (ví dụ: "mẹ" thay "nương" trong ngữ cảnh đời thường).
  Ngữ pháp:
  Đảm bảo câu văn hoàn toàn tuân theo ngữ pháp tiếng Việt, mạch lạc, trôi chảy, tránh lộn xộn với cấu trúc Trung Quốc.
  Sắp xếp theo thứ tự tự nhiên: "Trạng ngữ + Chủ ngữ + Động từ + Vị ngữ" (ví dụ: "Trên đỉnh núi, lão già tung kiếm chém gió").
  Bổ sung chủ ngữ nếu câu gốc thiếu để rõ nghĩa, nhưng không làm mất nhịp điệu.
  Đại từ xưng hô:
  Sử dụng linh hoạt, hợp ngữ cảnh: "lão giả" thành "lão", "hắn" thành "gã", "y" tùy tình huống thành "hắn" hoặc "kẻ ấy".
  Giữ phong cách xưng hô cổ đại Trung Quốc: "ta", "ngươi", "nàng", "tiểu thư", "tiên sinh", "gia gia", "tỷ tỷ", "lão sư". Không dùng "mày", "tao", "bạn".
  Danh từ riêng và thuật ngữ:
  Giữ nguyên tên riêng, địa danh, chiêu thức, điển tích ở dạng Hán Việt, phiên âm chuẩn (ví dụ: Giang Văn Khang, Thần Trúc Hải, Thiên Uyên, "thiên mệnh chi tử").
  Không dịch nghĩa hoặc viết hoa các thuật ngữ đặc thù (ví dụ: "văn phòng tứ bảo", "thần quang phổ chiếu").
  Số lượng từ và ngắt dòng:
  Giữ nguyên số dòng của bản gốc. Mỗi câu xuống dòng trong văn bản Trung Quốc phải thành một đoạn độc lập trong tiếng Việt.
  Đảm bảo số lượng từ không giảm quá nhiều so với nguyên tác. Không bỏ sót bất kỳ yếu tố nào, đặc biệt là hành động hoặc chi tiết quan trọng.
  Giữ nguyên dấu câu của tác giả, không tự ý thêm hay bớt.
  Tinh thần và giọng điệu:
  Bảo toàn cảm xúc và ý nghĩa gốc, từ sự hùng tráng của trận chiến đến cái thâm trầm của đạo lý.
  Điều chỉnh cấu trúc câu cho hợp tiếng Việt, nhưng không làm mất nhịp điệu hay khí thế của nguyên tác.
  Xử lý đặc thù:
  Từ tượng thanh/tượng hình: Dùng từ tiếng Việt quen thuộc (ví dụ: "kẽo kẹt" thay "chi nha", "ầm ầm" thay "oanh oanh").
  Thành ngữ, tục ngữ: Giữ dạng Hán Việt nếu phù hợp (ví dụ: "đánh rắn động cỏ"), hoặc chuyển sang tương đương tiếng Việt dễ hiểu (ví dụ: "hóa ra" thay "nguyên lai").
  Loại bỏ từ thừa kiểu dịch máy: "đem" (thành "Hắn đóng cửa" thay "Hắn đem cửa đóng"), "liền" (thay bằng "thì", "rồi" tùy ngữ cảnh).
  Mục tiêu:
  Tạo bản dịch chất lượng cao, truyền tải trọn vẹn tinh thần tiên hiệp cổ đại, từ những trận chiến long trời lở đất đến lời thoại sâu sắc của các bậc đại năng. Độc giả Việt Nam phải cảm nhận được cái hay, cái đẹp, và cái khí phách của nguyên tác.
  Hướng dẫn thực hiện:
  
  Đọc kỹ từng đoạn văn để nắm rõ ngữ cảnh và ý đồ tác giả.
  Dịch từng câu xuống dòng thành một đoạn độc lập, giữ nguyên nhịp điệu và số lượng từ.
  Duy trì phong cách cổ trang, ưu tiên từ Hán Việt quen thuộc, và đảm bảo mọi danh từ riêng được phiên âm chính xác.
  Kết quả cuối cùng: Văn bản tiếng Việt hoàn chỉnh, không chứa chú thích hay từ tiếng Trung (trừ trường hợp không dịch được).`,
          },
        ],
      },
      {
        role: "model",
        parts: [
          {
            text: "Tuyệt vời! Tôi đã sẵn sàng để bắt đầu dịch. Hãy cung cấp cho tôi văn bản tiếng Trung mà bạn muốn dịch. Tôi sẽ tuân thủ nghiêm ngặt tất cả các yêu cầu và hướng dẫn mà bạn đã đưa ra để đảm bảo bản dịch đạt chất lượng cao nhất, truyền tải trọn vẹn tinh thần và phong cách của tác phẩm gốc. Tôi sẽ tập trung vào việc giữ nguyên nội dung, phong cách, số lượng từ và dòng, đồng thời sử dụng ngôn ngữ Hán Việt phù hợp, đảm bảo tính mạch lạc và tự nhiên cho độc giả Việt Nam.",
          },
        ],
      },
      {
        role: "user",
        parts: [
          {
            text: rawText,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.7,
      topP: 0.9,
      responseMimeType: "text/plain",
    },
  };

  let response = fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:${generateContentApi}?key=${keyApi}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (response.ok) {
    let result = response.json();
    const translated = result.candidates[0].content.parts[0].text;
    return Response.success(translated);
  }
  return translateContent(text, from, to, retryCount + 1, getNextApiKey());
}
